// 已出卷數、下一卷發售日、最新刊、作者、出版社（日本原版）
// 來源（依序嘗試，配對到就停）：① 樂天 Books（需免費金鑰）② Google Books（免金鑰，可選填 GOOGLE_BOOKS_KEY）
//   data/auto-next.json            列表用（精簡）：released / next / latest / src / ck
//   data/detail/*.json  key "rkt"  詳情用：作者、出版社、最新刊價格、首刊日
//   data/state/rakuten-checked.json 上次檢查日期（給輪替用，前端不讀）
import fs from 'node:fs';
import { fetchRetry, sleep, todayJST, daysSince, writeDetails, stringifyItems, HAN, KANA } from './lib.mjs';
import { analyze, normalizeItems } from './rakuten-logic.mjs';
import { fromGoogle } from './google-logic.mjs';

const OUT = 'data/auto-next.json';
const STATE = 'data/state/rakuten-checked.json';
const STATUS = 'data/state/rakuten-status.json'; // 給 check-keys.mjs 判斷金鑰是否失效
const APP_ID = process.env.RAKUTEN_APP_ID;
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
const ORIGIN = process.env.RAKUTEN_ORIGIN || '';
const G_KEY = process.env.GOOGLE_BOOKS_KEY || '';
const USE_GOOGLE = process.env.DISABLE_GOOGLE !== '1';
const MAX_LOOKUPS = Number(process.env.MAX_LOOKUPS || 1500);
const MAX_MINUTES = Number(process.env.MAX_MINUTES || 50);

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const catalog = JSON.parse(fs.readFileSync('.cache/catalog.json', 'utf8'));
// 比對規則的版本：規則修正後把版本號 +1，舊的（可能配錯的）結果會被清掉並重新查詢
const LOGIC_VERSION = 3; // v3：支援羅馬數字卷數（插在主副標題中間，如「サイレント・ウィッチ XII 沈黙の魔女の隠しごと」）
let prev = readJSON(OUT, { items: {} }).items || {};
let checked = readJSON(STATE, {});
if (checked._v !== LOGIC_VERSION) {
  console.log(`比對規則已更新（v${checked._v ?? 1} → v${LOGIC_VERSION}），清除舊結果並重新檢查`);
  prev = {};
  checked = { _v: LOGIC_VERSION };
}
const today = todayJST();

/* ---------- 搜尋來源 ---------- */
const backends = [];
if (APP_ID && ACCESS_KEY) {
  backends.push({
    key: 'r', name: 'Rakuten', interval: 1100, streak: 0, disabled: false,
    async search(term) {
      const url = new URL('https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404');
      url.search = new URLSearchParams({
        applicationId: APP_ID, accessKey: ACCESS_KEY, title: term,
        sort: '-releaseDate', hits: '30', formatVersion: '2',
        elements: 'title,salesDate,isbn,itemUrl,size,booksGenreId,author,publisherName,itemPrice'
      });
      const headers = ORIGIN ? { Referer: ORIGIN + '/', Origin: ORIGIN } : {};
      const res = await fetchRetry(url, { headers }, { label: 'Rakuten', baseDelay: 5000 });
      if (res.status === 404) return [];
      if (!res.ok) {
        const e = new Error(`Rakuten HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        if ([400, 401, 403].includes(res.status)) e.auth = true; // 金鑰錯誤、過期或網域未許可
        throw e;
      }
      return normalizeItems(await res.json());
    }
  });
}
if (USE_GOOGLE) {
  backends.push({
    key: 'g', name: 'Google Books', interval: 1200, streak: 0, disabled: false,
    async search(term) {
      const url = new URL('https://www.googleapis.com/books/v1/volumes');
      const params = {
        q: `intitle:"${term}"`, printType: 'books', langRestrict: 'ja', orderBy: 'newest', maxResults: '40',
        fields: 'items(volumeInfo(title,subtitle,authors,publisher,publishedDate,industryIdentifiers,infoLink,seriesInfo),saleInfo(listPrice))'
      };
      if (G_KEY) params.key = G_KEY;
      url.search = new URLSearchParams(params);
      const res = await fetchRetry(url, {}, { label: 'GoogleBooks', tries: 2, baseDelay: 6000 });
      if (!res.ok) throw new Error(`Google Books HTTP ${res.status}`);
      return ((await res.json()).items || []).map(fromGoogle);
    }
  });
}
if (!backends.length) {
  console.log('沒有可用的搜尋來源（未設定樂天金鑰且停用了 Google Books），略過。');
  process.exit(0);
}
console.log('搜尋來源：' + backends.map((b) => b.name).join(' → ') + (APP_ID ? '' : '（未設定樂天金鑰，只用 Google Books，準確度較低）'));

/* ---------- 候選：連載中每 1 天、其餘每 90 天檢查一次 ---------- */
const ACTIVE = new Set(['RELEASING', 'NOT_YET_RELEASED', 'HIATUS']);
const isDue = (m) => daysSince(checked[m.id]) >= (ACTIVE.has(m.status) ? 1 : 90);
const candidates = catalog
  .filter((m) => m.title?.native && isDue(m) && (ACTIVE.has(m.status) || backends.some((b) => b.key === 'r'))) // 沒有樂天時，完結作品不查
  .sort((a, b) =>
    (ACTIVE.has(b.status) - ACTIVE.has(a.status)) ||
    String(checked[a.id] || '').localeCompare(String(checked[b.id] || '')) ||
    (b.popularity || 0) - (a.popularity || 0));
console.log(`到期 ${candidates.length} 部；本次最多查 ${MAX_LOOKUPS} 部 / ${MAX_MINUTES} 分鐘`);

const searchTerm = (t) => t.normalize('NFKC').replace(/[\p{P}\p{S}]+/gu, ' ').trim().split(/\s+/).slice(0, 4).join(' ');
/** 日文原名；連載中的作品再加上 AniList 別名裡的日文寫法（書名和出版社不同時仍能配到） */
function titlesFor(m) {
  const list = [m.title.native];
  if (ACTIVE.has(m.status)) {
    for (const s of m.synonyms || []) {
      if (list.length >= 3) break;
      if (KANA.test(s) && !list.includes(s) && s.length >= 4) list.push(s);
    }
  }
  return list;
}

const items = { ...prev };
const detail = {};
const started = Date.now();
const stats = { done: 0, found: 0, withNext: 0, byBackend: {} };
let lastAuthError = '';

for (const m of candidates) {
  if (stats.done >= MAX_LOOKUPS || (Date.now() - started) / 60000 > MAX_MINUTES) break;
  if (backends.every((b) => b.disabled)) { console.warn('所有搜尋來源都暫時不可用，提早結束'); break; }

  const deep = ACTIVE.has(m.status);
  let best = null, used = null, anyOk = false;
  search: for (const b of backends) {
    if (b.disabled) continue;
    if (!deep && b.key === 'g') continue; // 完結作品只查樂天，省時間與配額
    for (const t of titlesFor(m)) {
      try {
        const list = await b.search(searchTerm(t));
        b.streak = 0; anyOk = true;
        await sleep(b.interval);
        const r = analyze(list, t, today);
        if (r.matched) { best = r; used = b; break search; }
      } catch (err) {
        b.streak++;
        if (err.auth) { b.authErrors = (b.authErrors || 0) + 1; lastAuthError = err.message; }
        console.warn(`× ${b.name} ${m.id} ${t}: ${err.message}`);
        if (b.streak >= 8) { b.disabled = true; console.warn(`${b.name} 連續失敗，本次停用`); break; }
        await sleep(b.interval);
      }
    }
  }
  stats.done++;
  if (!anyOk) continue; // 全部失敗就不更新這部，下次再試

  checked[m.id] = today;
  if (best) {
    stats.found++;
    stats.byBackend[used.name] = (stats.byBackend[used.name] || 0) + 1;
    const e = { src: used.key, ck: today };
    if (best.released != null) e.released = best.released;
    if (best.next) { e.next = best.next; stats.withNext++; }
    if (best.latest) e.latest = { volume: best.latest.volume, date: best.latest.date };
    items[m.id] = e;
    const d = {};
    if (best.author.length) d.au = best.author;
    if (best.publisher) d.pub = best.publisher;
    if (best.latest) d.latest = best.latest;
    if (best.first) d.first = best.first;
    if (used.key === 'g') d.src = 'g';
    detail[m.id] = Object.keys(d).length ? d : null;
  } else {
    delete items[m.id];
    detail[m.id] = null;
  }
  if (stats.done % 100 === 0) console.log(`…已查 ${stats.done} 部（配對 ${stats.found}，有下一卷日期 ${stats.withNext}）`);
}

const keep = new Set(catalog.map((m) => String(m.id)));
for (const id of Object.keys(items)) if (!keep.has(id)) delete items[id];

fs.mkdirSync('data/state', { recursive: true });
fs.writeFileSync(STATE, JSON.stringify(checked) + '\n');
fs.writeFileSync(OUT, stringifyItems({ v: 1, source: 'Rakuten Books / Google Books', updated: new Date().toISOString() }, items));
const shards = writeDetails('rkt', detail);
const rk = backends.find((b) => b.key === 'r');
if (rk) {
  const failed = (rk.authErrors || 0) >= 3 && !stats.byBackend.Rakuten;
  fs.writeFileSync(STATUS, JSON.stringify({ updated: new Date().toISOString(), ok: !failed, authError: failed ? lastAuthError : '' }) + '\n');
}
console.log(`完成：查詢 ${stats.done} 部，配對 ${stats.found}（${JSON.stringify(stats.byBackend)}），有下一卷日期 ${stats.withNext}；auto-next ${Object.keys(items).length} 筆，詳情分片變動 ${shards} 個`);
