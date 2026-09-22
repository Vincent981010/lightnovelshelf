// 由 catalog 的續作關聯產生 data/series.json：{ groups: [[id1,id2,...], ...] }（依發售順序）
import fs from 'node:fs';
import { buildGroups } from './series-logic.mjs';

const catalog = JSON.parse(fs.readFileSync('.cache/catalog.json', 'utf8'));
const groups = buildGroups(catalog);
if (!groups.length) throw new Error('沒有產生任何系列分組，可能是 relations 沒抓到，中止以免覆蓋現有資料');

const big = groups.filter((g) => g.length > 30);
if (big.length) console.warn(`⚠ 有 ${big.length} 個系列超過 30 部，可能合併過度：`, big.map((g) => g[0]).join(', '));

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(
  'data/series.json',
  `{"v":1,"updated":${JSON.stringify(new Date().toISOString())},"groups":[\n${groups.map((g) => JSON.stringify(g)).join(',\n')}\n]}\n`
);
console.log(`已寫入 data/series.json：${groups.length} 個系列，涵蓋 ${groups.reduce((n, g) => n + g.length, 0)} 部條目`);
