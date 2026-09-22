// 共用工具：網路請求（含重試）、繁簡轉換、標題正規化
import fs from 'node:fs';
import * as OpenCC from 'opencc-js';

export const t2s = OpenCC.Converter({ from: 'tw', to: 'cn' });
export const s2t = OpenCC.Converter({ from: 'cn', to: 'tw' });

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const HAN = /\p{Script=Han}/u;
export const KANA = /[\u3040-\u30ff\u31f0-\u31ff]/;
export const HANGUL = /[\uac00-\ud7af\u1100-\u11ff]/;

/** 搜尋用的比對 key：NFKC → 繁轉簡 → 小寫 → 移除空白與標點。前端必須用完全相同的規則。 */
export function normalizeKey(s) {
  return t2s(String(s ?? '').normalize('NFKC'))
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

/** 日本時間今天的日期 YYYY-MM-DD（GitHub runner 是 UTC，要自己換算） */
export function todayJST(now = Date.now()) {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export const UA = `lightnovel-shelf/1.0 (+https://github.com/${process.env.GITHUB_REPOSITORY || 'your/repo'})`;

/** fetch + 重試：429 / 5xx 會等待後重試 */
export async function fetchRetry(url, options = {}, { tries = 4, baseDelay = 3000, label = url } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...options, headers: { 'User-Agent': UA, ...(options.headers || {}) } });
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after'));
        const wait = ra ? ra * 1000 : baseDelay * (i + 1);
        lastErr = new Error(`${label} → HTTP ${res.status}`);
        await sleep(Math.min(wait, 60000));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      await sleep(baseDelay * (i + 1));
    }
  }
  throw lastErr;
}

export async function anilist(query, variables) {
  const res = await fetchRetry(
    'https://graphql.anilist.co',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables })
    },
    { label: 'AniList' }
  );
  const json = await res.json();
  if (json.errors) throw new Error('AniList: ' + JSON.stringify(json.errors[0]));
  return json.data;
}

/** 距今天數（YYYY-MM-DD 字串），無日期回傳 Infinity */
export function daysSince(dateStr, now = Date.now()) {
  const t = Date.parse(dateStr);
  return Number.isFinite(t) ? Math.floor((now - t) / 86400000) : Infinity;
}

/** 每 1000 個 AniList ID 一個分片：詳細資料（簡介、標籤、作者…）在開啟作品詳情時才載入 */
export const SHARD = 1000;
export const shardOf = (id) => Math.floor(Number(id) / SHARD);

/**
 * 寫入詳細資料分片 data/detail/<n>.json。
 * 每個資料來源只更新自己的 key（例如 "bgm"、"rkt"、"mal"），值為 null 表示移除。
 * 內容沒變就不寫檔，避免無謂的 git 差異。回傳有變動的分片數。
 */
export function writeDetails(key, patches, dir = 'data/detail') {
  fs.mkdirSync(dir, { recursive: true });
  const byShard = new Map();
  for (const [id, val] of Object.entries(patches)) {
    const sh = shardOf(id);
    if (!byShard.has(sh)) byShard.set(sh, {});
    byShard.get(sh)[id] = val;
  }
  let changed = 0;
  for (const [sh, part] of byShard) {
    const file = `${dir}/${sh}.json`;
    let cur = {};
    try { cur = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    let dirty = false;
    for (const [id, val] of Object.entries(part)) {
      cur[id] ||= {};
      const before = JSON.stringify(cur[id][key]);
      if (val == null) delete cur[id][key]; else cur[id][key] = val;
      if (JSON.stringify(cur[id][key]) !== before) dirty = true;
      if (!Object.keys(cur[id]).length) delete cur[id];
    }
    if (dirty) {
      const sorted = Object.fromEntries(Object.entries(cur).sort((a, b) => a[0] - b[0]));
      fs.writeFileSync(file, JSON.stringify(sorted) + '\n');
      changed++;
    }
  }
  return changed;
}

/** 每行一筆的 JSON，git diff 比較好讀 */
export function stringifyItems(meta, items) {
  const lines = Object.entries(items).sort((a, b) => a[0] - b[0]).map(([id, v]) => `${JSON.stringify(id)}:${JSON.stringify(v)}`);
  return `{${Object.entries(meta).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',')},"items":{\n${lines.join(',\n')}\n}}\n`;
}
