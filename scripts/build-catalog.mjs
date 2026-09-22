// .cache/catalog.json（AniList 全部輕小說）→ data/catalog.json（網站讀取的精簡目錄）
import fs from 'node:fs';
import { catalogRow, COLS } from './catalog-logic.mjs';

const catalog = JSON.parse(fs.readFileSync('.cache/catalog.json', 'utf8'));
if (catalog.length < 500) throw new Error(`目錄只有 ${catalog.length} 筆，數量異常，中止`);
const rows = catalog.map(catalogRow).sort((a, b) => a[0] - b[0]);

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(
  'data/catalog.json',
  `{"v":1,"updated":${JSON.stringify(new Date().toISOString())},"cols":${JSON.stringify(COLS)},"rows":[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`
);
const kb = Math.round(fs.statSync('data/catalog.json').size / 1024);
console.log(`已寫入 data/catalog.json：${rows.length} 部，${kb} KB`);
