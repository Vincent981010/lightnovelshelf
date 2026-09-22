// 由樂天 Books 搜尋結果推算「已出到第幾卷」與「下一卷發售日」。純函式，方便測試。

const PUNCT = /[\s\p{P}\p{S}]/u;
/** 漫畫版（同名作品的漫畫卷數會和小說卷數混在一起）：分類 001001，或 size 為「コミック」 */
export function isComic(it) {
  const genre = String(it.booksGenreId || '');
  return /(^|\/)001001/.test(genre) || /コミック|漫画/.test(String(it.size || '')) || Number(it.size) === 10;
}

const EXCLUDE = /(コミック|コミカライズ|漫画|画集|イラスト集|ファンブック|ガイドブック|アンソロジー|ドラマCD|設定資料|カレンダー|Blu-?ray|DVD|ムック)/i;

/** 若 title 以 base 開頭（忽略空白與標點差異），回傳剩餘字串；否則 null */
export function stripPrefix(title, base) {
  const t = [...String(title).normalize('NFKC')];
  const b = [...String(base).normalize('NFKC')].filter((c) => !PUNCT.test(c)).map((c) => c.toLowerCase());
  if (!b.length) return null;
  let i = 0, j = 0;
  while (j < b.length && i < t.length) {
    if (PUNCT.test(t[i])) { i++; continue; }
    if (t[i].toLowerCase() !== b[j]) return null;
    i++; j++;
  }
  return j === b.length ? t.slice(i).join('') : null;
}

const nk = (x) => String(x || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

/* 羅馬數字卷數：書店常把「サイレント・ウィッチ XII 沈黙の魔女の隠しごと」這種寫法，
   把卷數（半形 XII 或全形單字元 Ⅻ）插在主標題和副標題中間，前後夾著空白。 */
const ASCII_ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
const UNI_ROMAN = { 0x2160: 1, 0x2161: 2, 0x2162: 3, 0x2163: 4, 0x2164: 5, 0x2165: 6, 0x2166: 7, 0x2167: 8, 0x2168: 9, 0x2169: 10, 0x216a: 11, 0x216b: 12, 0x216c: 50, 0x216d: 100, 0x216e: 500, 0x216f: 1000 };
function romanCharValue(ch) {
  const up = ch.toUpperCase();
  if (up in ASCII_ROMAN) return ASCII_ROMAN[up];
  let cp = ch.codePointAt(0);
  if (cp >= 0x2170 && cp <= 0x217f) cp -= 0x10; // 小寫版本
  return UNI_ROMAN[cp] ?? null;
}
export function romanToInt(token) {
  const chars = [...String(token || '')];
  if (!chars.length) return null;
  const values = chars.map(romanCharValue);
  if (values.some((v) => v == null)) return null;
  let total = 0;
  for (let i = 0; i < values.length; i++) total += values[i] < values[i + 1] ? -values[i] : values[i];
  return total >= 1 && total <= 200 ? total : null;
}

/** 書名裡有一個空白隔開的「羅馬數字」token，拿掉它之後跟原名完全相同 → 那就是卷數 */
export function extractInsertedVolume(title, native) {
  const target = nk(native);
  if (!target) return null;
  const parts = String(title).normalize('NFKC').split(/\s+/).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const vol = romanToInt(parts[i]);
    if (vol == null) continue;
    const remainder = parts.slice(0, i).concat(parts.slice(i + 1)).join('');
    if (nk(remainder) === target) return vol;
  }
  return null;
}

/** 「主標題 ～副標題～」拆成 { main, sub }；沒有副標題時 sub 為空字串 */
export function splitTitle(native) {
  const n = String(native || '').normalize('NFKC').trim();
  const m = n.match(/^(.{3,}?)\s*[~〜～―—–:：]\s*(.+)$/u);
  if (!m) return { main: n, sub: '' };
  const sub = m[2].replace(/[~〜～―—–\s]+$/u, '');
  return nk(m[1]).length >= 4 && nk(sub).length >= 2 ? { main: m[1].trim(), sub } : { main: n, sub: '' };
}

/** 剩餘字串必須「很乾淨」地以卷數開頭，才視為本篇的一卷（避免短篇集、外傳被混入） */
const VOL_RE = /^[\s\p{P}\p{S}]*(?:第|vol\.?|volume)?\s*(\d{1,3})(?:\s*(?:巻|卷|冊)|(?![\d\p{L}]|\.\d|\s*[年月日話章期部]))/iu;
export function parseVolume(rest) {
  const m = String(rest).match(VOL_RE);
  return m ? Number(m[1]) : null;
}
function parseVolumeTail(rest) {
  const m = String(rest).match(VOL_RE);
  return m ? { vol: Number(m[1]), tail: String(rest).slice(m[0].length) } : null;
}

/** 「2026年12月25日」→ {date}；「2026年12月下旬」→ {approx, ym}；其他 → null */
export function parseSalesDate(s) {
  const t = String(s || '').normalize('NFKC').trim();
  // ISO 格式（Google Books）：2026-12-25 / 2026-12
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}` };
  m = t.match(/^(\d{4})-(\d{2})$/);
  if (m) return { approx: `${m[1]}年${Number(m[2])}月`, ym: `${m[1]}-${m[2]}` };
  m = t.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (m) return { date: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` };
  m = t.match(/(\d{4})年\s*(\d{1,2})月/);
  if (m) return { approx: m[0].replace(/\s+/g, '') + (t.match(/(上旬|中旬|下旬|頃|ごろ)/)?.[1] ?? ''), ym: `${m[1]}-${m[2].padStart(2, '0')}` };
  return null;
}

export function splitNames(s) {
  return String(s || '').normalize('NFKC').split(/[\/／、,，]/).map((x) => x.trim()).filter(Boolean).slice(0, 4);
}

export function analyze(items, baseTitle, today) {
  const rows = [];
  const { main, sub } = splitTitle(baseTitle);
  for (const it of items) {
    const title = it.title || '';
    if (isComic(it) || EXCLUDE.test(title)) continue;
    let vol = null;
    const rest = stripPrefix(title, baseTitle);
    if (rest !== null) vol = parseVolume(rest);
    if (vol == null && sub) {
      // 「作品名１２ ～副標題～」：卷數在主標題之後、副標題之前
      const r2 = stripPrefix(title, main);
      const pv = r2 !== null ? parseVolumeTail(r2) : null;
      if (pv) {
        const tail = pv.tail.replace(/[（(][^）)]*[）)]/g, ''); // 去掉「(一迅社ノベルス)」之類的括號
        if (!nk(tail) || nk(tail).includes(nk(sub))) vol = pv.vol;
      }
    }
    if (vol == null) vol = extractInsertedVolume(title, baseTitle);
    if (vol == null) continue;
    const sd = parseSalesDate(it.salesDate);
    if (!sd) continue;
    rows.push({ vol, ...sd, isbn: it.isbn, url: it.itemUrl, price: Number(it.itemPrice) || undefined, author: it.author, publisher: it.publisherName, ln: /001017/.test(String(it.booksGenreId || '')) });
  }
  // 若有被歸類在「ライトノベル」分類的商品，以它們為準
  const pool = rows.some((r) => r.ln) ? rows.filter((r) => r.ln) : rows;

  const past = pool.filter((r) => r.date && r.date <= today);
  const maxReleased = past.length ? Math.max(...past.map((r) => r.vol)) : null;
  const latestRow = past.length ? [...past].sort((a, b) => b.vol - a.vol || a.date.localeCompare(b.date))[0] : null;
  const infoRow = latestRow || pool[0] || null;
  const firstDate = pool.filter((r) => r.vol === 1 && r.date).map((r) => r.date).sort()[0] || null;

  let upcoming = pool.filter((r) => (r.date && r.date > today) || (!r.date && r.ym >= today.slice(0, 7)));
  if (maxReleased != null) upcoming = upcoming.filter((r) => r.vol > maxReleased && r.vol <= maxReleased + 3);
  upcoming.sort((a, b) => a.vol - b.vol || String(a.date || a.ym).localeCompare(String(b.date || b.ym)));

  const n = upcoming[0];
  const next = n
    ? { volume: n.vol, ...(n.date ? { date: n.date } : { approx: n.approx }), ...(n.url ? { url: n.url } : {}) }
    : null;
  return {
    released: maxReleased,
    next,
    matched: pool.length,
    author: infoRow ? splitNames(infoRow.author) : [],
    publisher: infoRow?.publisher ? String(infoRow.publisher).trim() : '',
    latest: latestRow ? { volume: latestRow.vol, date: latestRow.date, ...(latestRow.price ? { price: latestRow.price } : {}), ...(latestRow.url ? { url: latestRow.url } : {}) } : null,
    first: firstDate
  };
}

/** 樂天回傳格式（Items / items、有無 Item 包裝）都能吃 */
export function normalizeItems(data) {
  const arr = data?.Items || data?.items || [];
  return arr.map((x) => x.Item || x.item || x);
}
