// 網站用的作品目錄：把 AniList 全部輕小說壓成精簡陣列，網站直接讀取，
// 這樣搜尋、篩選、系列合併都不必在瀏覽器端呼叫 AniList（避免被限流 / 連線失敗）。
export const CDN = 'https://s4.anilist.co/file/anilistcdn/';
export const COLS = ['id', 'native', 'romaji', 'english', 'status', 'volumes', 'start', 'end', 'popularity', 'score', 'cover', 'updatedAt'];

const STATUS = { RELEASING: 'R', FINISHED: 'F', NOT_YET_RELEASED: 'N', HIATUS: 'H', CANCELLED: 'C' };
const ymd = (d) => (d?.year ? d.year * 10000 + (d.month || 0) * 100 + (d.day || 0) : 0);

export function catalogRow(m) {
  const t = m.title || {};
  const native = t.native || '';
  const romaji = t.romaji && t.romaji !== native ? t.romaji : '';
  const english = t.english && t.english !== t.romaji && t.english !== native ? t.english : '';
  const cover = String(m.coverImage?.large || '').replace(CDN, '');
  return [m.id, native, romaji, english, STATUS[m.status] || '', m.volumes || 0, ymd(m.startDate), ymd(m.endDate), m.popularity || 0, m.averageScore || 0, cover, m.updatedAt || 0];
}
