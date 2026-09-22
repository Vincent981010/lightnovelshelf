// MyAnimeList（Jikan API，免費、免金鑰）→ data/mal.json + 詳情分片 "mal"
// 以 AniList 條目的 idMal 對應。每 MAL_REFRESH_DAYS 天才會整批重抓一次。
import fs from 'node:fs';
import { fetchRetry, sleep, daysSince, writeDetails, stringifyItems } from './lib.mjs';
import { parseMal } from './mal-logic.mjs';

const OUT = 'data/mal.json';
const REFRESH_DAYS = Number(process.env.MAL_REFRESH_DAYS || 6);
const MAX_MINUTES = Number(process.env.MAX_MINUTES || 45);

let prev = { items: {} };
try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}

if (!process.env.FORCE && prev.updated && daysSince(prev.updated) < REFRESH_DAYS) {
  console.log(`MAL 資料 ${daysSince(prev.updated)} 天前才更新過（< ${REFRESH_DAYS} 天），略過。`);
  process.exit(0);
}

const catalog = JSON.parse(fs.readFileSync('.cache/catalog.json', 'utf8'));
const malToAni = new Map(catalog.filter((m) => m.idMal).map((m) => [m.idMal, m.id]));
console.log(`AniList 條目 ${catalog.length}，其中有 MAL ID：${malToAni.size}`);

const fresh = {}, freshDetail = {};
const started = Date.now();
let pages = 0, partial = false;

outer: for (const type of ['lightnovel', 'novel']) {
  for (let page = 1; page <= 2000; page++) {
    if ((Date.now() - started) / 60000 > MAX_MINUTES) { partial = true; break outer; }
    const url = `https://api.jikan.moe/v4/manga?type=${type}&order_by=mal_id&sort=asc&limit=25&page=${page}`;
    let json;
    try {
      const res = await fetchRetry(url, {}, { label: `Jikan ${type} p${page}`, baseDelay: 5000 });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      json = await res.json();
    } catch (e) {
      console.warn(`⚠ ${type} 第 ${page} 頁失敗：${e.message}，此類型提早結束`);
      partial = true;
      break;
    }
    pages++;
    for (const d of json.data || []) {
      const aid = malToAni.get(d.mal_id);
      if (!aid) continue;
      const { list, detail } = parseMal(d);
      fresh[aid] = list;
      freshDetail[aid] = Object.keys(detail).length ? detail : null;
    }
    if (pages % 50 === 0) console.log(`…${type} 已抓 ${pages} 頁，對應到 ${Object.keys(fresh).length} 部`);
    if (!json.pagination?.has_next_page) break;
    await sleep(1100); // Jikan：3 次/秒、60 次/分鐘
  }
}

// 合併：新資料覆蓋舊資料；沒抓到的保留舊的（避免部分失敗時資料變少）
const keep = new Set(catalog.map((m) => String(m.id)));
const items = {};
for (const [id, v] of Object.entries(prev.items || {})) if (keep.has(id)) items[id] = v;
Object.assign(items, fresh);

if (Object.keys(items).length < 100 && !partial) throw new Error('MAL 對應數量異常偏少，中止');

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(OUT, stringifyItems({ v: 1, source: 'MyAnimeList (Jikan)', updated: partial ? (prev.updated || '1970-01-01T00:00:00.000Z') : new Date().toISOString(), partial }, items));
const shards = writeDetails('mal', freshDetail);
console.log(`完成：${pages} 頁，MAL 資料 ${Object.keys(items).length} 筆（本次更新 ${Object.keys(fresh).length}），詳情分片變動 ${shards} 個${partial ? '（部分完成）' : ''}`);
