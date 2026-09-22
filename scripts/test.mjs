// 純函式測試：node scripts/test.mjs
import assert from 'node:assert/strict';
import { analyze, parseVolume, parseSalesDate, stripPrefix, splitTitle, romanToInt, extractInsertedVolume } from './rakuten-logic.mjs';
import { buildEntry, chineseSynonyms, parseWikidata } from './zh-logic.mjs';
import { normalizeKey, todayJST } from './lib.mjs';
import { buildGroups } from './series-logic.mjs';
import { parseMal, flipName } from './mal-logic.mjs';
import { parseBangumi, pickSearchMatch, infoValue } from './bangumi-logic.mjs';
import { writeDetails } from './lib.mjs';
import { bangumiCandidates } from './zh-logic.mjs';
import { fromGoogle } from './google-logic.mjs';
import { evaluate } from './check-keys.mjs';
import { catalogRow, CDN } from './catalog-logic.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// --- 卷數解析 ---
assert.equal(parseVolume(' 27'), 27);
assert.equal(parseVolume('　第5巻'), 5);
assert.equal(parseVolume('（12）'), 12);
assert.equal(parseVolume(' 3 ～ぽんこつ～'), 3);
assert.equal(parseVolume(' Vol.14'), 14);
assert.equal(parseVolume(' 短編集3'), null); // 外傳／短篇集不算
assert.equal(parseVolume(' 5.5'), null);
assert.equal(stripPrefix('Re：ゼロから始める異世界生活 30', 'Re:ゼロから始める異世界生活'), ' 30');
assert.equal(stripPrefix('別の作品 1', 'ソードアート・オンライン'), null);

// 「2年生編 12.5」不可被當成第 2 卷
assert.equal(parseVolume(' 2年生編 12.5'), null);
assert.equal(parseVolume(' 2年生編 12'), null);
assert.equal(parseVolume(' 2 年生編'), null);
assert.equal(parseVolume(' 12.5'), null);
assert.equal(parseVolume(' 27巻'), 27);
assert.equal(analyze([{ title: 'ようこそ実力至上主義の教室へ 2年生編 12', salesDate: '2024年05月25日', size: 2 }], 'ようこそ実力至上主義の教室へ', '2026-09-20').matched, 0);

// --- 日期解析 ---
assert.deepEqual(parseSalesDate('2026年12月25日'), { date: '2026-12-25' });
assert.equal(parseSalesDate('2026年12月下旬').approx, '2026年12月下旬');
assert.equal(parseSalesDate('2026年'), null);

// --- 下一卷推算 ---
const today = '2026-09-20';
const items = [
  { title: 'ソードアート・オンライン 27', salesDate: '2026年07月10日', size: 2, isbn: '1', itemUrl: 'u27' },
  { title: 'ソードアート・オンライン 28', salesDate: '2026年12月10日', size: 2, isbn: '2', itemUrl: 'u28' },
  { title: 'ソードアート・オンライン 29', salesDate: '2027年03月', size: 2 },
  { title: 'ソードアート・オンライン 26', salesDate: '2026年03月10日', size: 2 },
  { title: 'ソードアート・オンライン 27', salesDate: '2026年10月01日', size: 'コミック', booksGenreId: '001001' }, // 漫畫版要排除
  { title: 'ソードアート・オンライン外伝 5', salesDate: '2026年11月01日', size: 2 },
  { title: 'ソードアート・オンライン プログレッシブ 9', salesDate: '2026年11月01日', size: 2 }
];
const r = analyze(items, 'ソードアート・オンライン', today);
assert.equal(r.released, 27);
assert.deepEqual(r.next, { volume: 28, date: '2026-12-10', url: 'u28' });

// 只有概略日期
const r2 = analyze([{ title: 'テスト作品 4', salesDate: '2026年11月下旬', size: 2 }, { title: 'テスト作品 3', salesDate: '2026年05月01日', size: 2 }], 'テスト作品', today);
assert.equal(r2.released, 3);
assert.equal(r2.next.volume, 4);
assert.equal(r2.next.approx, '2026年11月下旬');

// 沒有新刊
const r3 = analyze([{ title: 'テスト作品 3', salesDate: '2026年05月01日', size: 2 }], 'テスト作品', today);
assert.equal(r3.next, null);

// --- 中文索引 ---
const e = buildEntry([
  { text: '关于我转生变成史莱姆这档事', lang: 'zh-hans', kind: 'label' },
  { text: '關於我轉生變成史萊姆這檔事', lang: 'zh-hant', kind: 'label' }
]);
assert.equal(e[0], '關於我轉生變成史萊姆這檔事'); // 顯示繁體
assert.equal(normalizeKey('關於我轉生變成史萊姆這檔事'), normalizeKey('关于我转生变成史莱姆这档事')); // 繁簡同 key
assert.ok(e.length === 2); // 兩者 key 相同，只留一個

const simpOnly = buildEntry([{ text: '魔法禁书目录', lang: 'zh-cn', kind: 'label' }]);
assert.equal(simpOnly[0], '魔法禁書目錄');

const syn = chineseSynonyms({
  title: { native: '蟲師' },
  synonyms: ['Mushishi', '蟲師', '虫师', 'ギンコ', '蟲師 特別篇', '무시시']
});
assert.deepEqual(syn.map((s) => s.text), ['虫师', '蟲師 特別篇']);

const wd = parseWikidata([
  { id: { value: '85737' }, label: { value: '從零開始的異世界生活', 'xml:lang': 'zh-hant' }, kind: { value: 'label' } }
]);
assert.equal(wd.get(85737)[0].lang, 'zh-hant');

// --- 系列分組（AniList 把 1年生編／2年生編／3年生編拆成三筆）---
const rel = (t, id) => ({ relationType: t, node: { id } });
const cat = [
  { id: 94970, startDate: { year: 2015, month: 5 }, relations: { edges: [rel('SEQUEL', 115166), rel('ADAPTATION', 999)] } },
  { id: 186990, startDate: { year: 2024, month: 11 }, relations: { edges: [rel('PREQUEL', 115166)] } },
  { id: 115166, startDate: { year: 2020, month: 1 }, relations: { edges: [rel('PREQUEL', 94970), rel('SEQUEL', 186990), rel('SIDE_STORY', 50)] } },
  { id: 50, startDate: { year: 2021 }, relations: { edges: [rel('PARENT', 94970)] } },
  { id: 7, startDate: {}, relations: { edges: [] } }
];
assert.deepEqual(buildGroups(cat), [[94970, 115166, 186990]]);

// 外傳：書名前綴相同才併入，否則不併
const cat2 = [
  { id: 1, title: { native: 'ようこそ実力至上主義の教室へ' }, startDate: { year: 2015 }, relations: { edges: [rel('SIDE_STORY', 2), rel('SIDE_STORY', 3)] } },
  { id: 2, title: { native: 'ようこそ実力至上主義の教室へ 堀北鈴音編' }, startDate: { year: 2016 }, relations: { edges: [] } },
  { id: 3, title: { native: '全然別の作品名です' }, startDate: { year: 2017 }, relations: { edges: [] } }
];
assert.deepEqual(buildGroups(cat2), [[1, 2]]);

// --- 實例：《ふつつかな悪女ではございますが》小說第12卷，被漫畫版（10卷）與副標題格式搞錯 ---
const fut = [
  { title: 'ふつつかな悪女ではございますが１２ ～雛宮蝶鼠とりかえ伝～', salesDate: '2026年03月31日', size: '単行本', booksGenreId: '001017/001017001', itemPrice: 1496, itemUrl: 'n12' },
  { title: 'ふつつかな悪女ではございますが１３ ～雛宮蝶鼠とりかえ伝～', salesDate: '2026年09月30日', size: '単行本', booksGenreId: '001017/001017001', itemPrice: 1496, itemUrl: 'n13' },
  { title: 'ふつつかな悪女ではございますが１１ ～雛宮蝶鼠とりかえ伝～', salesDate: '2025年09月30日', size: '単行本', booksGenreId: '001017/001017001', itemPrice: 1496 },
  // 漫畫版：分類 001001、size 為「コミック」，卷數不同，必須排除
  { title: 'ふつつかな悪女ではございますが ～雛宮蝶鼠とりかえ伝～ 10', salesDate: '2026年03月31日', size: 'コミック', booksGenreId: '001001/001001007' },
  { title: 'ふつつかな悪女ではございますが ～雛宮蝶鼠とりかえ伝～ 11', salesDate: '2026年09月30日', size: 'コミック', booksGenreId: '001001/001001007' },
  // 掌編集（另一套卷數）不可混入
  { title: 'ふつつかな悪女ではございますが掌編集 ～雛宮蝶鼠とりかえ伝～', salesDate: '2026年08月31日', size: '単行本', booksGenreId: '001017/001017001' }
];
const futR = analyze(fut, 'ふつつかな悪女ではございますが ~雛宮蝶鼠とりかえ伝~', '2026-09-21');
assert.equal(futR.released, 12);
assert.deepEqual(futR.next, { volume: 13, date: '2026-09-30', url: 'n13' });
assert.equal(futR.latest.volume, 12);
// 就算沒有分類資訊、只靠 size 也要能排除漫畫
const noGenre = analyze(fut.map((x) => ({ ...x, booksGenreId: x.size === 'コミック' ? '' : '' })), 'ふつつかな悪女ではございますが ~雛宮蝶鼠とりかえ伝~', '2026-09-21');
assert.equal(noGenre.released, 12);
assert.equal(splitTitle('Re:ゼロから始める異世界生活').sub, ''); // 不誤拆
assert.equal(splitTitle('ふつつかな悪女ではございますが ~雛宮蝶鼠とりかえ伝~').main, 'ふつつかな悪女ではございますが');

// --- 實例：《サイレント・ウィッチ》羅馬數字卷數插在主標題與副標題中間 ---
assert.equal(romanToInt('XII'), 12);
assert.equal(romanToInt('Ⅻ'), 12);
assert.equal(romanToInt('Ⅳ'), 4);
assert.equal(romanToInt('iv'), 4);
assert.equal(romanToInt('沈黙'), null); // 一般日文字不可誤判
assert.equal(romanToInt(''), null);
const SW = 'サイレント・ウィッチ 沈黙の魔女の隠しごと';
assert.equal(extractInsertedVolume('サイレント・ウィッチ XII 沈黙の魔女の隠しごと', SW), 12);
assert.equal(extractInsertedVolume('サイレント・ウィッチ Ⅻ 沈黙の魔女の隠しごと', SW), 12);
assert.equal(extractInsertedVolume('サイレント・ウィッチ 沈黙の魔女の隠しごと', SW), null); // 沒有插入卷數，不誤判
assert.equal(extractInsertedVolume('全然別の作品 XII サブタイトル', SW), null); // 主體對不上就不採用

const swItems = [
  { title: 'サイレント・ウィッチ XI 沈黙の魔女の隠しごと', salesDate: '2026年01月09日', size: '文庫', booksGenreId: '001017' },
  { title: 'サイレント・ウィッチ Ⅻ 沈黙の魔女の隠しごと', salesDate: '2026年06月10日', size: '文庫', booksGenreId: '001017', itemUrl: 'sw12' },
  { title: 'サイレント・ウィッチ 沈黙の魔女の隠しごと 1', salesDate: '2021年06月10日', size: 'コミック', booksGenreId: '001001' } // 漫畫版，須排除
];
const swR = analyze(swItems, SW, '2026-09-21');
assert.equal(swR.released, 12);
assert.equal(swR.next, null); // 12 卷已是最新，沒有已公布的下一卷

// --- 樂天：作者／出版社／最新刊／首刊 ---
const rk = analyze([
  { title: 'テスト作品 1', salesDate: '2020年01月10日', size: 2, author: '山田太郎／佐藤花子', publisherName: 'KADOKAWA', itemPrice: 726 },
  { title: 'テスト作品 2', salesDate: '2020年05月10日', size: 2, author: '山田太郎／佐藤花子', publisherName: 'KADOKAWA', itemPrice: 748, itemUrl: 'u2' }
], 'テスト作品', today);
assert.deepEqual(rk.author, ['山田太郎', '佐藤花子']);
assert.equal(rk.publisher, 'KADOKAWA');
assert.deepEqual(rk.latest, { volume: 2, date: '2020-05-10', price: 748, url: 'u2' });
assert.equal(rk.first, '2020-01-10');

// --- Google Books（ISO 日期、系列卷數補齊）---
assert.deepEqual(parseSalesDate('2026-12-25'), { date: '2026-12-25' });
assert.deepEqual(parseSalesDate('2026-12'), { approx: '2026年12月', ym: '2026-12' });
assert.equal(parseSalesDate('2026'), null);
const g1 = fromGoogle({ volumeInfo: { title: 'ソードアート・オンライン', subtitle: '28', publishedDate: '2026-12-10', authors: ['川原礫'], publisher: 'KADOKAWA', industryIdentifiers: [{ type: 'ISBN_10', identifier: '1' }, { type: 'ISBN_13', identifier: '9784048000000' }], infoLink: 'http://g/1' }, saleInfo: { listPrice: { amount: 748 } } });
assert.equal(g1.title, 'ソードアート・オンライン 28');
assert.equal(g1.isbn, '9784048000000');
assert.equal(fromGoogle({ volumeInfo: { title: 'テスト作品', seriesInfo: { bookDisplayNumber: '5' } } }).title, 'テスト作品 5');
const gr = analyze([g1, fromGoogle({ volumeInfo: { title: 'ソードアート・オンライン 27', publishedDate: '2026-07-10' } })], 'ソードアート・オンライン', '2026-09-20');
assert.equal(gr.released, 27);
assert.deepEqual(gr.next, { volume: 28, date: '2026-12-10', url: 'http://g/1' });

// --- MAL ---
assert.equal(flipName('Kinugasa, Shougo'), 'Shougo Kinugasa');
const mal = parseMal({ mal_id: 1, volumes: 14, status: 'Finished', published: { from: '2015-05-25T00:00:00+00:00', to: null }, score: 7.9,
  authors: [{ name: 'Kinugasa, Shougo' }], serializations: [{ name: 'MF Bunko J' }] });
assert.deepEqual(mal.list, { m: 1, v: 14, s: 'F', f: '2015-05-25', sc: 7.9 });
assert.deepEqual(mal.detail.au, ['Shougo Kinugasa']);
assert.equal(parseMal({ mal_id: 2, volumes: null, status: 'Publishing' }).list.v, undefined);

// --- Bangumi ---
const sub = { id: 100, name: 'ようこそ実力至上主義の教室へ', name_cn: '欢迎来到实力至上主义的教室', date: '2015-05-25', volumes: 14,
  summary: '这里是简体的简介。', rating: { score: 7.6 },
  tags: [{ name: '轻小说', count: 500 }, { name: '校园', count: 2 }, { name: '战斗', count: 90 }],
  infobox: [{ key: '出版社', value: 'KADOKAWA' }, { key: '作者', value: '衣笠彰梧' }, { key: '插图', value: 'トモセシュンサク' },
            { key: '别名', value: [{ v: '歡迎來到實力至上主義的教室' }, { v: 'Youjitsu' }] }] };
const bg = parseBangumi(sub);
assert.deepEqual(bg.list, { b: 100, v: 14, sc: 7.6, n: '欢迎来到实力至上主义的教室' });
assert.equal(bg.detail.sum, '這裡是簡體的簡介。'); // 簡→繁
assert.deepEqual(bg.detail.tags, ['輕小說', '戰鬥']); // 出現次數過少的標籤被濾掉
assert.equal(bg.detail.pub, 'KADOKAWA');
assert.equal(infoValue(sub.infobox, '不存在', '作者'), '衣笠彰梧');
assert.equal(pickSearchMatch([{ id: 1, name: 'ようこそ 実力至上主義の教室へ' }, { id: 2, name: '別の作品' }], 'ようこそ実力至上主義の教室へ').id, 1);
assert.equal(pickSearchMatch([{ id: 1, name: 'A' }, { id: 2, name: 'A' }], 'A'), null); // 同名多筆不猜
assert.equal(bangumiCandidates('欢迎来到实力至上主义的教室', ['歡迎來到實力至上主義的教室', 'Youjitsu', 'ようこそ']).length, 2);

// --- 詳情分片：各來源只改自己的 key，內容沒變不重寫 ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'detail-'));
assert.equal(writeDetails('bgm', { 1500: { sum: 'a' }, 1600: { sum: 'b' }, 2500: { sum: 'c' } }, tmp), 2);
assert.equal(writeDetails('rkt', { 1500: { pub: 'X' } }, tmp), 1);
assert.equal(writeDetails('bgm', { 1500: { sum: 'a' } }, tmp), 0); // 沒變
const sh = JSON.parse(fs.readFileSync(path.join(tmp, '1.json'), 'utf8'));
assert.deepEqual(sh['1500'], { bgm: { sum: 'a' }, rkt: { pub: 'X' } });
writeDetails('bgm', { 1500: null }, tmp);
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp, '1.json'), 'utf8'))['1500'], { rkt: { pub: 'X' } });

// --- 網站目錄 ---
const row = catalogRow({ id: 5, title: { native: '蟲師', romaji: 'Mushishi', english: 'Mushishi' }, status: 'FINISHED', volumes: 10,
  startDate: { year: 2000, month: 3, day: 5 }, endDate: { year: 2002 }, popularity: 999, averageScore: 81,
  coverImage: { large: CDN + 'media/manga/cover/large/bx5-abc.jpg' }, updatedAt: 1700000000 });
assert.deepEqual(row, [5, '蟲師', 'Mushishi', '', 'F', 10, 20000305, 20020000, 999, 81, 'media/manga/cover/large/bx5-abc.jpg', 1700000000]);
assert.equal(catalogRow({ id: 6, title: { native: 'X', romaji: 'X' }, coverImage: { large: 'https://other.host/a.jpg' } })[10], 'https://other.host/a.jpg');

// --- 金鑰到期提醒 ---
assert.equal(evaluate({ expires: '2027-09-21', today: '2026-09-21', authError: '' }).need, false);
assert.equal(evaluate({ expires: '', today: '2026-09-21', authError: '' }).need, false);
const ex = evaluate({ expires: '2027-09-21', today: '2027-09-01', authError: '' });
assert.equal(ex.need, true);
assert.match(ex.title, /20 天後/);
assert.match(evaluate({ expires: '2027-09-21', today: '2027-10-01', authError: '' }).title, /已過期/);
assert.match(evaluate({ expires: '', today: '2026-09-21', authError: 'Rakuten HTTP 403' }).title, /被拒絕/);

// --- 日本時間 ---
assert.equal(todayJST(Date.UTC(2026, 8, 20, 16, 0)), '2026-09-21'); // UTC 16:00 = JST 隔天 01:00

console.log('✅ 全部測試通過');
