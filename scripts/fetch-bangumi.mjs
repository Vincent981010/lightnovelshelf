// Bangumi（bgm.tv）→ data/bangumi.json（列表用）＋詳情分片 "bgm"（簡介、標籤、作者、出版社…）
// 對應方式：① 維基資料的 Bangumi subject ID（P5732）② 用日文原名搜尋、完全同名才採用（每次限量）
import fs from 'node:fs';
import { fetchRetry, sleep, daysSince, todayJST, writeDetails, stringifyItems } from './lib.mjs';
import { parseBangumi, pickSearchMatch } from './bangumi-logic.mjs';

const OUT = 'data/bangumi.json';
const MAP_FILE = 'data/state/bangumi-map.json';   // AniList ID → Bangumi ID（維基資料）
const MISS_FILE = 'data/state/bangumi-miss.json'; // 搜尋不到的 AniList ID → 檢查日期
const MAX_LOOKUPS = Number(process.env.BGM_MAX_LOOKUPS || 700);
const MAX_SEARCH = Number(process.env.BGM_MAX_SEARCH || 150);
const MAX_MINUTES = Number(process.env.MAX_MINUTES || 30);
const INTERVAL = 650;
const API = 'https://api.bgm.tv';

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const catalog = JSON.parse(fs.readFileSync('.cache/catalog.json', 'utf8'));
const prev = readJSON(OUT, { items: {} });
const miss = readJSON(MISS_FILE, {});
const today = todayJST();

/* 1) 維基資料對應表 */
const map = readJSON(MAP_FILE, {});
try {
  const maxId = Math.max(...catalog.map((m) => m.id));
  const STEP = 25000;
  const fresh = {};
  for (let from = 0; from <= maxId; from += STEP) {
    const sparql = `SELECT ?id ?bid WHERE { ?item wdt:P8731 ?id ; wdt:P5732 ?bid .
      FILTER(xsd:integer(?id) >= ${from} && xsd:integer(?id) < ${from + STEP}) }`;
    const res = await fetchRetry(
      'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql),
      { headers: { Accept: 'application/sparql-results+json' } },
      { label: `Wikidata bgm ${from}`, baseDelay: 8000 }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    for (const b of (await res.json()).results.bindings) fresh[b.id.value] = Number(b.bid.value);
    await sleep(1500);
  }
  Object.assign(map, fresh);
  fs.mkdirSync('data/state', { recursive: true });
  fs.writeFileSync(MAP_FILE, JSON.stringify(map) + '\n');
  console.log(`維基資料 → Bangumi 對應：${Object.keys(fresh).length} 筆（累計 ${Object.keys(map).length}）`);
} catch (e) {
  console.warn(`⚠ 維基資料對應失敗（${e.message}），沿用舊對應表（${Object.keys(map).length} 筆）`);
}

/* 2) 候選：有對應但資料過舊／從未抓過 */
const byId = new Map(catalog.map((m) => [m.id, m]));
const ACTIVE = new Set(['RELEASING', 'NOT_YET_RELEASED', 'HIATUS']);
const stale = (id) => {
  const p = prev.items[id];
  if (!p?.ck) return true;
  return daysSince(p.ck) >= (ACTIVE.has(byId.get(Number(id))?.status) ? 7 : 45);
};
const mapped = Object.keys(map).filter((id) => byId.has(Number(id)) && stale(id))
  .sort((a, b) => (byId.get(Number(b)).popularity || 0) - (byId.get(Number(a)).popularity || 0));

const toSearch = catalog
  .filter((m) => !map[m.id] && !prev.items[m.id] && m.title?.native && daysSince(miss[m.id]) >= 60)
  .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
  .slice(0, MAX_SEARCH);

console.log(`待更新（有對應）${mapped.length} 部、待搜尋 ${toSearch.length} 部；本次最多 ${MAX_LOOKUPS} 次請求`);

/* 3) 呼叫 Bangumi */
const headers = { Accept: 'application/json' };
async function getSubject(bid) {
  const res = await fetchRetry(`${API}/v0/subjects/${bid}`, { headers }, { label: `bgm ${bid}`, baseDelay: 4000 });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
async function searchByTitle(title) {
  const res = await fetchRetry(
    `${API}/v0/search/subjects?limit=5`,
    { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ keyword: title, sort: 'match', filter: { type: [1] } }) },
    { label: 'bgm search', baseDelay: 4000 }
  );
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return (await res.json()).data || [];
}

const items = {};
for (const [id, v] of Object.entries(prev.items || {})) if (byId.has(Number(id))) items[id] = v;
const detail = {};
const started = Date.now();
let calls = 0, ok = 0, streak = 0, matchedBySearch = 0;
const timeUp = () => calls >= MAX_LOOKUPS || (Date.now() - started) / 60000 > MAX_MINUTES;

async function record(aid, sub) {
  const { list, detail: d } = parseBangumi(sub);
  items[aid] = { ...list, ck: today };
  detail[aid] = Object.keys(d).length ? d : null;
  ok++;
}

for (const id of mapped) {
  if (timeUp() || streak >= 10) break;
  try {
    const sub = await getSubject(map[id]); calls++;
    if (sub) await record(id, sub);
    streak = 0;
  } catch (e) { calls++; streak++; console.warn(`× ${id}: ${e.message}`); }
  await sleep(INTERVAL);
}

for (const m of toSearch) {
  if (timeUp() || streak >= 10) break;
  try {
    const results = await searchByTitle(m.title.native); calls++;
    const hit = pickSearchMatch(results, m.title.native);
    if (hit) {
      const sub = await getSubject(hit.id); calls++;
      if (sub) { await record(String(m.id), sub); matchedBySearch++; }
    } else miss[m.id] = today;
    streak = 0;
  } catch (e) { calls++; streak++; console.warn(`× search ${m.id}: ${e.message}`); }
  await sleep(INTERVAL);
}

fs.mkdirSync('data/state', { recursive: true });
fs.writeFileSync(MISS_FILE, JSON.stringify(miss) + '\n');
fs.writeFileSync(OUT, stringifyItems({ v: 1, source: 'Bangumi', updated: new Date().toISOString() }, items));
const shards = writeDetails('bgm', detail);
console.log(`完成：請求 ${calls} 次，寫入 ${ok} 部（搜尋配對 ${matchedBySearch}），累計 ${Object.keys(items).length} 部，詳情分片變動 ${shards} 個`);
