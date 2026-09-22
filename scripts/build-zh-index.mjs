// 中文書名索引：AniList 別名（synonyms）+ 維基資料（Wikidata）的中文標籤
// 輸出 data/zh-index.json ： { items: { "<AniList ID>": ["顯示名", "搜尋key", ...] } }
import fs from 'node:fs';
import { fetchRetry, sleep } from './lib.mjs';
import { chineseSynonyms, parseWikidata, buildEntry, bangumiCandidates } from './zh-logic.mjs';

const OUT = 'data/zh-index.json';
const catalog = JSON.parse(fs.readFileSync('.cache/catalog.json', 'utf8'));
const ids = new Set(catalog.map((m) => m.id));

/* 1) Wikidata：以「AniList manga ID（P8731）」對應 */
const LANGS = ['zh', 'zh-hant', 'zh-tw', 'zh-hk', 'zh-mo', 'zh-hans', 'zh-cn', 'zh-sg', 'zh-my'];
const wikidata = new Map();
const maxId = Math.max(...ids);
const STEP = 25000;
let wdFailed = 0;

for (let from = 0; from <= maxId; from += STEP) {
  const sparql = `
SELECT ?id ?label ?kind WHERE {
  ?item wdt:P8731 ?id .
  FILTER(xsd:integer(?id) >= ${from} && xsd:integer(?id) < ${from + STEP})
  { ?item rdfs:label ?label . BIND("label" AS ?kind) }
  UNION
  { ?item skos:altLabel ?label . BIND("alias" AS ?kind) }
  FILTER(LANG(?label) IN (${LANGS.map((l) => `"${l}"`).join(',')}))
}`;
  try {
    const res = await fetchRetry(
      'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql),
      { headers: { Accept: 'application/sparql-results+json' } },
      { label: `Wikidata ${from}`, baseDelay: 8000 }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    parseWikidata(json.results.bindings, wikidata);
    console.log(`Wikidata id ${from}~${from + STEP}: ${json.results.bindings.length} 筆`);
  } catch (e) {
    wdFailed++;
    console.warn(`⚠ Wikidata 區段 ${from} 失敗：${e.message}（沿用舊索引）`);
  }
  await sleep(1500);
}

/* 1.5) Bangumi：中文名（name_cn）與別名（常含台灣譯名） */
const bangumiList = (() => { try { return JSON.parse(fs.readFileSync('data/bangumi.json', 'utf8')).items || {}; } catch { return {}; } })();
const bangumiAlias = new Map();
try {
  for (const f of fs.readdirSync('data/detail')) {
    if (!f.endsWith('.json')) continue;
    const shard = JSON.parse(fs.readFileSync(`data/detail/${f}`, 'utf8'));
    for (const [id, d] of Object.entries(shard)) if (d.bgm?.alias?.length) bangumiAlias.set(Number(id), d.bgm.alias);
  }
} catch {}

/* 2) 合併：舊索引 → 只補洞，不覆蓋新資料 */
let prev = {};
try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')).items || {}; } catch {}

const items = {};
for (const m of catalog) {
  const cands = [...(wikidata.get(m.id) || []), ...chineseSynonyms(m), ...bangumiCandidates(bangumiList[m.id]?.n, bangumiAlias.get(m.id))];
  const entry = buildEntry(cands);
  if (entry) items[m.id] = entry;
  else if (prev[m.id] && wdFailed) items[m.id] = prev[m.id];
}

fs.mkdirSync('data', { recursive: true });
const lines = Object.entries(items).map(([id, v]) => `${JSON.stringify(id)}:${JSON.stringify(v)}`);
fs.writeFileSync(
  OUT,
  `{"v":1,"updated":${JSON.stringify(new Date().toISOString())},"items":{\n${lines.join(',\n')}\n}}\n`
);
console.log(`已寫入 ${OUT}：${lines.length} 部作品有中文名（Wikidata 失敗區段：${wdFailed}）`);
