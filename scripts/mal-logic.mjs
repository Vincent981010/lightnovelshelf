// MyAnimeList（經 Jikan API）資料解析。純函式。
const STATUS = { Finished: 'F', Publishing: 'P', 'On Hiatus': 'H', Discontinued: 'D', 'Not yet published': 'N' };

/** "Kinugasa, Shougo" → "Shougo Kinugasa" */
export function flipName(n) {
  const m = String(n || '').match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : String(n || '').trim();
}

/** → { list: 列表用精簡欄位, detail: 詳情分片用欄位 } */
export function parseMal(d) {
  const list = { m: d.mal_id };
  if (d.volumes) list.v = d.volumes;
  if (d.chapters) list.c = d.chapters;
  const s = STATUS[d.status];
  if (s) list.s = s;
  const f = d.published?.from?.slice(0, 10), t = d.published?.to?.slice(0, 10);
  if (f) list.f = f;
  if (t) list.t = t;
  if (d.score) list.sc = d.score;

  const detail = {};
  const au = (d.authors || []).map((a) => flipName(a.name)).filter(Boolean).slice(0, 4);
  const z = (d.serializations || []).map((x) => x.name).filter(Boolean).slice(0, 3);
  if (au.length) detail.au = au;
  if (z.length) detail.z = z;
  if (d.scored_by) detail.by = d.scored_by;
  if (d.rank) detail.rank = d.rank;
  return { list, detail };
}
