# 輕小說書架

純靜態網站，放 GitHub Pages 即可。資料由 GitHub Actions 每天自動更新。

## 資料怎麼來（多來源整合）

| 來源 | 需要金鑰 | 提供什麼 | 檔案 |
|---|---|---|---|
| AniList | 否 | 作品清單、狀態、卷數、封面、續作關聯；開啟詳情時即時取得作者／插畫、標籤、官網連結 | 瀏覽器直接查詢 |
| MyAnimeList（Jikan） | 否 | 卷數、狀態、首刊／完結日、評分、連載雜誌／叢書 | `data/mal.json` |
| Bangumi | 否 | 中文簡介、標籤、評分、作者、插畫、出版社、中文名與別名（含台灣譯名） | `data/bangumi.json` + 詳情分片 |
| 維基資料 | 否 | 中文書名、AniList↔Bangumi 對應 | `data/zh-index.json` |
| 樂天 Books | 是（免費） | 已出卷數、下一卷發售日、最新刊、作者、出版社、價格（**最即時的來源**） | `data/auto-next.json` + 詳情分片 |
| Google Books | 否（可選填免費金鑰） | 同上，準確度較低；沒有樂天金鑰、或樂天配不到時的備援 | 同上 |
| 人工修正 | — | 任何欄位 | `data/next-volumes.json` |

**補值規則**
- 卷數：完結作品以 AniList 為準（缺才用 MAL → Bangumi → 樂天）；連載中取各來源最大值。詳情頁會列出各來源的數字方便對照。
- 狀態：人工 > AniList > MAL。
- 中文名：人工 > 維基資料 > Bangumi／AniList 別名（簡體自動轉繁體）。
- 系列合併：依 AniList 續作關聯（見下方）。

**檔案分工**：列表要用的精簡資料（`mal.json`、`bangumi.json`、`auto-next.json`…）開站時就載入；簡介、標籤、作者這類較大的資料放在 `data/detail/<編號>.json` 分片，點開作品詳情時才載入那一片，不會拖慢首頁。

**什麼時候會自動跑**
- 排程：台灣時間 02:20（完整）、08:20、14:20、20:20（輕量）。GitHub 排程有時會延遲數分鐘到一小時，偶爾會跳過一次，屬正常現象。
- 上傳新版程式（`scripts/`、workflow、`package.json`）後自動跑一次。
- 隨時可以到 Actions 手動 Run workflow。
- 公開 repo 若 60 天完全沒有活動，GitHub 會停用排程並先寄 email 通知；平常每次更新都會產生 commit，不會發生。

**更新頻率**
- 連載中作品的發售資料（樂天／Google Books）：**每天 4 次**（台灣時間 02:20、08:20、14:20、20:20），每部約每天檢查一次。
- AniList 本身：網頁即時查詢。
- MyAnimeList：每 6 天；Bangumi、中文名、系列分組：每天一次（02:20 那一輪）。
- 每個來源獨立執行，某個來源暫時失敗不會影響其他來源。

**關於「即時」的限制**：AniList、MyAnimeList 的卷數是使用者手動維護的，常落後實際發售數週；Bangumi 也是社群維護。真正接近即時的只有書店資料（樂天）。所以：
- 想讓連載中作品的卷數準確，**請設定樂天金鑰**（沒設定的話，連載中作品的卷數就只能靠上述會落後的來源）。
- 詳情頁的「卷數對照」會列出各來源的數字與檢查日期，可以看出是哪個來源落後。
- 個別作品還是不準時，可在 `data/next-volumes.json` 手動指定 `volumes`、`next`。

## 一次性設定

1. 到 https://webservice.rakuten.co.jp/ 註冊，建立 App，取得 **Application ID** 與 **Access Key**（免費）。
2. Repo → Settings → Secrets and variables → Actions → New repository secret：
   - `RAKUTEN_APP_ID`
   - `RAKUTEN_ACCESS_KEY`
   - `GOOGLE_BOOKS_KEY`（選填。到 Google Cloud 啟用 Books API 取得免費金鑰，配額比免金鑰穩定）
   - `RAKUTEN_ORIGIN`（選填。若樂天 App 有設定「允許的網站」，填 `https://你的帳號.github.io`）
3. Repo → Settings → Actions → General → Workflow permissions → **Read and write permissions**。
4. Repo → Settings → Pages → Deploy from a branch → main / root。
5. Actions 分頁 → **Update data** → Run workflow（第一次會跑比較久，之後每天自動跑）。

## 疑難排解：連載中作品全部顯示「卷數未知／下一卷未公布」

這代表資料更新（GitHub Actions）還沒有成功跑過，網站只拿得到 AniList 的原始資料（連載中的作品 AniList 通常沒有卷數，也沒有發售日）。

1. 開啟 `https://github.com/你的帳號/repo名/actions/workflows/update-data.yml`。
2. 如果顯示「0 workflow runs」：右側按 **Run workflow** → 綠色 **Run workflow**（排程不會在剛上傳後馬上跑）。
3. 如果看得到紅色 ✗：點進去看是哪一個步驟失敗、把錯誤訊息貼給我。
4. 首次執行約 1～2 小時；每個來源跑完就會 commit 一次，可以陸續重新整理網站看到資料。網頁最下方的「資料狀態」會顯示各來源已有幾筆資料。
5. 「下一卷發售日」目前只有樂天 Books 提供，沒有設定 `RAKUTEN_APP_ID` / `RAKUTEN_ACCESS_KEY` 就一定是「未公布」；卷數則可由 MAL、Bangumi 補齊，不需要金鑰。

## 本機測試

```bash
npm install
npm test
```

## 金鑰到期提醒

樂天的應用程式有有效期限（大約一年），我沒有找到可以自動續期的官方機制，所以做成「到期前提醒你」：

1. Repo → Settings → Secrets and variables → Actions → **Variables** 分頁 → New repository variable：名稱 `RAKUTEN_EXPIRES`，值填到期日，例如 `2027-09-21`。
2. 每次更新時會檢查：剩 30 天內、已過期、或樂天拒絕金鑰時，自動開一則標籤為 `key-expiry` 的 Issue，GitHub 會寄 email 通知你。
3. 金鑰失效期間不會壞掉：網站自動改用 Google Books 備援，只是準確度較低。

## 系列合併

AniList 常把同一部作品拆成多筆（例如《ようこそ実力至上主義の教室へ》分成 1年生編、2年生編、3年生編）。
網站會依續作關聯把它們合併成一張卡片：

- 卷數 = 各分冊加總
- 狀態 = 只要有任何一個分冊連載中或尚未發售，整個系列就是「連載中」
- 下一卷 = 各分冊中最早的一個
- 點開卡片可以看每個分冊各自的狀態與卷數；不想合併可取消「依系列合併」

- 外傳、短篇集等副關聯，只有在「書名前綴相同」時才併入同一系列
- 系列名稱優先用中文（取各分冊中最短的中文名，也就是去掉「2年生編」之類後綴的名字）
- 也可以手動指定：在 `data/series-manual.json` 的 `groups` 放入同系列的 AniList ID（依發售順序），不必等 Actions，commit 後就生效

`data/series.json` 要跑過一次 **Update data** 才會有內容；在那之前網站會維持一部作品一張卡片。
若 AniList 沒有建立續作關聯、或漏了新的分冊，可以在 `data/next-volumes.json` 對該分冊手動指定 `status`、`volumes`、`next`。

## 注意

- 發售日是**日本原版**的日期；台灣中文版日期沒有免費公開來源，可用 `data/next-volumes.json` 手動補。
- 樂天配對是用書名比對，書名格式特殊的作品（例如卷數寫成「第五部」）可能配不到，會顯示「未公布」，請用手動修正。
- 樂天每次最多查 1500 部：連載中每 2 天輪一次，已完結的每 90 天輪一次，所以完結作品的作者／出版社會花幾天到一兩週才慢慢補齊。Bangumi 同理（每次約 700 次請求）。
- 第一次執行會比較久（可能超過 1 小時），可到 Actions 頁面看進度。
- 公開 repo 若 60 天完全沒有活動，GitHub 會停用排程；到 Actions 頁面重新啟用即可。
