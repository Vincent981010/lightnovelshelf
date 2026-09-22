// Bangumi（bgm.tv）資料解析與配對。純函式。
import { s2t, normalizeKey } from './lib.mjs';

/** infobox 的值可能是字串或 [{v:..}] 陣列 */
export function infoValue(infobox, ...keys) {
  for (const key of keys) {
    const it = (infobox || []).find((x) => x.key === key);
    if (!it) continue;
    const v = Array.isArray(it.value) ? it.value.map((x) => x?.v ?? x).filter(Boolean).join('、') : String(it.value ?? '');
    if (v.trim()) return v.trim();
  }
  return '';
}

export function infoList(infobox, key) {
  const it = (infobox || []).find((x) => x.key === key);
  if (!it) return [];
  return (Array.isArray(it.value) ? it.value.map((x) => x?.v ?? x) : [it.value]).map((x) => String(x).trim()).filter(Boolean);
}

const cut = (s, n) => (s.length > n ? s.slice(0, n).replace(/[，。、；\s]*$/, '') + '…' : s);

/** → { list, detail }。簡介與標籤由簡體轉成繁體；人名、出版社保持原樣。 */
export function parseBangumi(sub) {
  const info = sub.infobox || [];
  const vols = Number(sub.volumes) || Number(infoValue(info, '册数', '冊數')) || 0;
  const list = { b: sub.id };
  if (vols) list.v = vols;
  if (sub.rating?.score) list.sc = sub.rating.score;
  if (sub.name_cn) list.n = sub.name_cn;

  const detail = {};
  const summary = String(sub.summary || '').replace(/\r?\n+/g, '\n').trim();
  if (summary) detail.sum = s2t(cut(summary, 500));
  const tags = (sub.tags || [])
    .filter((t) => t.name && (t.count ?? 0) >= 3)
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 12)
    .map((t) => s2t(t.name));
  if (tags.length) detail.tags = tags;
  const au = infoValue(info, '作者', '原作');
  const il = infoValue(info, '插图', '插画', '插畫');
  const pub = infoValue(info, '出版社');
  const mag = infoValue(info, '连载杂志', '連載雜誌');
  const label = infoValue(info, '文库', '文庫', '丛书', '叢書');
  if (au) detail.au = au;
  if (il) detail.il = il;
  if (pub) detail.pub = pub;
  if (label) detail.label = label;
  if (mag) detail.mag = mag;
  if (sub.date) detail.date = sub.date;
  const aliases = infoList(info, '别名');
  if (aliases.length) detail.alias = aliases.slice(0, 8);
  return { list, detail };
}

/** 從搜尋結果挑出與 AniList 日文原名完全相同（忽略空白標點）的那一筆 */
export function pickSearchMatch(results, nativeTitle) {
  const k = normalizeKey(nativeTitle);
  if (!k) return null;
  const hits = (results || []).filter((r) => normalizeKey(r.name) === k);
  return hits.length === 1 ? hits[0] : null; // 有多筆同名就不猜
}
