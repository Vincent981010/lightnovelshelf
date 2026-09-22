// 系列分組：AniList 常把同一部作品拆成多個條目（例如「1年生編」「2年生編」「3年生編」）。
// 這裡用 PREQUEL / SEQUEL 關聯把它們併成一個系列。純函式。

const SERIES_RELATIONS = new Set(['PREQUEL', 'SEQUEL']);
// 外傳、短篇集、番外等：只有「書名前綴相同」時才併入（避免把不相干的作品串在一起）
const LOOSE_RELATIONS = new Set(['SIDE_STORY', 'PARENT', 'SPIN_OFF', 'ALTERNATIVE', 'SUMMARY', 'OTHER', 'CHARACTER']);

const nk = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
export function prefixRelated(a, b) {
  const x = nk(a), y = nk(b);
  if (!x || !y) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 5 && long.startsWith(short);
}

const dateKey = (d) => (d?.year ? d.year * 10000 + (d.month || 0) * 100 + (d.day || 0) : Infinity);

export function buildGroups(catalog) {
  const ids = new Set(catalog.map((m) => m.id));
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
    return x;
  };
  for (const m of catalog) parent.set(m.id, m.id);
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb)); };

  for (const m of catalog)
    for (const e of m.relations?.edges || [])
      if (!ids.has(e.node?.id)) continue;
      else if (SERIES_RELATIONS.has(e.relationType)) union(m.id, e.node.id);
      else if (LOOSE_RELATIONS.has(e.relationType) && prefixRelated(m.title?.native, byId.get(e.node.id)?.title?.native)) union(m.id, e.node.id);

  const buckets = new Map();
  for (const m of catalog) {
    const r = find(m.id);
    if (!buckets.has(r)) buckets.set(r, []);
    buckets.get(r).push(m);
  }
  return [...buckets.values()]
    .filter((g) => g.length >= 2)
    .map((g) => g.sort((a, b) => dateKey(a.startDate) - dateKey(b.startDate) || a.id - b.id).map((m) => m.id))
    .sort((a, b) => a[0] - b[0]);
}
