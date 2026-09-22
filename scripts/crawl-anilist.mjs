// 抓取 AniList 上所有輕小說（含續作關聯）→ .cache/catalog.json
// 依「開始年份」分段抓取，避免單一查詢分頁過深；若查詢太複雜會自動縮小每頁筆數。
import fs from 'node:fs';
import { anilist, sleep } from './lib.mjs';

const QUERY = `
query($page:Int,$perPage:Int,$from:FuzzyDateInt,$to:FuzzyDateInt,$status:MediaStatus){
  Page(page:$page,perPage:$perPage){
    pageInfo{ hasNextPage }
    media(type:MANGA,format:NOVEL,isAdult:false,sort:ID,
          startDate_greater:$from,startDate_lesser:$to,status:$status){
      id idMal status volumes popularity synonyms
      title{ native romaji english }
      startDate{ year month day }
      endDate{ year month day }
      coverImage{ large }
      averageScore updatedAt
      relations{ edges{ relationType node{ id } } }
    }
  }
}`;

let perPage = 50;

async function crawl(vars, into) {
  for (let page = 1; ; page++) {
    let data;
    try {
      data = await anilist(QUERY, { ...vars, page, perPage });
    } catch (e) {
      // GraphQL 端回報錯誤（例如查詢過於複雜）→ 縮小每頁筆數重試；網路錯誤已由 fetchRetry 處理
      if (e.message.startsWith('AniList:') && perPage > 10) {
        perPage = Math.max(10, Math.floor(perPage / 2));
        console.warn(`AniList 回報錯誤（${e.message.slice(0, 160)}），每頁改為 ${perPage} 筆，重新開始此區段`);
        return crawl(vars, into);
      }
      throw e;
    }
    for (const m of data.Page.media) into.set(m.id, m);
    if (!data.Page.pageInfo.hasNextPage) break;
    await sleep(750); // AniList 上限 90 次/分鐘
  }
}

const catalog = new Map();
const nowYear = new Date().getUTCFullYear();

await crawl({ to: 19800000 }, catalog);
console.log('≤1979:', catalog.size);
for (let y = 1980; y <= nowYear + 2; y++) {
  await crawl({ from: y * 10000 - 1, to: (y + 1) * 10000 }, catalog);
  console.log(y, catalog.size);
  await sleep(750);
}
await crawl({ status: 'NOT_YET_RELEASED' }, catalog);
console.log('total', catalog.size);

if (catalog.size < 500) throw new Error(`只抓到 ${catalog.size} 筆，數量異常，中止以免覆蓋現有資料`);

fs.mkdirSync('.cache', { recursive: true });
fs.writeFileSync('.cache/catalog.json', JSON.stringify([...catalog.values()]));
console.log('已寫入 .cache/catalog.json');
