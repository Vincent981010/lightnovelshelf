// Google Books API（免費、金鑰選用）的結果轉成與樂天相同的格式，好共用 analyze()。純函式。

export function fromGoogle(item) {
  const vi = item?.volumeInfo || {};
  let title = [vi.title, vi.subtitle].filter(Boolean).join(' ').trim();
  const n = vi.seriesInfo?.bookDisplayNumber;
  if (n && !/\d\s*$/.test(title)) title += ` ${n}`; // 卷數不在書名裡時，補上系列資訊裡的卷數
  const ids = vi.industryIdentifiers || [];
  const isbn = (ids.find((x) => x.type === 'ISBN_13') || ids[0])?.identifier;
  return {
    title,
    salesDate: vi.publishedDate,
    isbn,
    itemUrl: vi.infoLink,
    author: (vi.authors || []).join('／'),
    publisherName: vi.publisher,
    itemPrice: item?.saleInfo?.listPrice?.amount,
    booksGenreId: (vi.categories || []).some((c) => /comics|graphic novels|manga/i.test(c)) ? '001001' : ''
  };
}
