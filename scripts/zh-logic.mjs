// 中文書名索引的純函式（方便測試，不做任何網路請求）
import { t2s, s2t, HAN, KANA, HANGUL, normalizeKey } from './lib.mjs';

const TRAD_LANGS = new Set(['zh-hant', 'zh-tw', 'zh-hk', 'zh-mo']);
const SIMP_LANGS = new Set(['zh-hans', 'zh-cn', 'zh-sg', 'zh-my']);

const isTrad = (s) => t2s(s) !== s; // 含有「只有繁體才有」的字
const isSimp = (s) => !isTrad(s) && s2t(s) !== s; // 含有簡體字、且沒有繁體字

/** 從 AniList synonyms 挑出看起來是中文的別名（有漢字、沒有假名／諺文） */
export function chineseSynonyms(media) {
  const native = (media.title?.native || '').trim();
  return (media.synonyms || [])
    .map((s) => String(s).trim())
    .filter((s) => s && s !== native && HAN.test(s) && !KANA.test(s) && !HANGUL.test(s) && s.length <= 80)
    .map((text) => ({ text, lang: 'syn', kind: 'syn' }));
}

/** 解析 Wikidata SPARQL 回傳 → Map<anilistId, [{text, lang, kind}]> */
export function parseWikidata(bindings, into = new Map()) {
  for (const b of bindings) {
    const id = Number(b.id?.value);
    const text = b.label?.value?.trim();
    if (!id || !text) continue;
    const lang = (b.label['xml:lang'] || '').toLowerCase();
    const kind = b.kind?.value === 'alias' ? 'alias' : 'label';
    if (!into.has(id)) into.set(id, []);
    into.get(id).push({ text, lang, kind });
  }
  return into;
}

function score({ text, lang, kind }) {
  let s;
  if (isTrad(text)) s = 100; // 確定是繁體
  else if (TRAD_LANGS.has(lang)) s = 90; // 維基資料標示繁體
  else if (!isSimp(text)) s = 60; // 中性字（繁簡同形）
  else if (lang === 'zh') s = 50;
  else s = 30; // 簡體
  if (kind === 'label') s += 10;
  else if (kind === 'alias') s -= 5;
  if (SIMP_LANGS.has(lang) && s > 60) s = 60;
  return s;
}

/** 從候選名稱挑出「顯示用」的繁體中文書名；簡體會轉成繁體 */
export function pickDisplay(cands) {
  if (!cands.length) return null;
  const best = [...cands].sort((a, b) => score(b) - score(a))[0];
  return isSimp(best.text) ? s2t(best.text) : best.text;
}

/** 產生一部作品的索引項：[顯示名, key1, key2, ...] */
export function buildEntry(cands, maxKeys = 8) {
  const display = pickDisplay(cands);
  if (!display) return null;
  const keys = [];
  for (const c of [{ text: display }, ...cands]) {
    const k = normalizeKey(c.text);
    if (k && !keys.includes(k)) keys.push(k);
    if (keys.length >= maxKeys) break;
  }
  return [display, ...keys];
}

/** Bangumi 的中文名與別名（只收有漢字、沒有假名的） */
export function bangumiCandidates(nameCn, aliases = []) {
  const out = [];
  if (nameCn && HAN.test(nameCn) && !KANA.test(nameCn)) out.push({ text: nameCn.trim(), lang: 'zh', kind: 'label' });
  for (const a of aliases || []) {
    const t = String(a).trim();
    if (t && HAN.test(t) && !KANA.test(t) && !HANGUL.test(t) && t.length <= 80) out.push({ text: t, lang: 'syn', kind: 'alias' });
  }
  return out;
}
