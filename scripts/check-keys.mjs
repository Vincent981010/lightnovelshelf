// 檢查樂天金鑰：① 快到期（RAKUTEN_EXPIRES，格式 YYYY-MM-DD）② 最近一次執行被拒絕（過期／錯誤／網域未許可）
// 需要提醒時，寫出 .cache/key-issue.md 並設定輸出 need=true，由 workflow 開一則 GitHub Issue（你會收到 email）
import fs from 'node:fs';
import { todayJST } from './lib.mjs';

const WARN_DAYS = 30;

/** 純函式：回傳 { need, title, body } */
export function evaluate({ expires, today, authError }) {
  const reasons = [];
  let title = '';
  if (authError) {
    title = '⚠️ 樂天 API 金鑰被拒絕，發售日資料已改用備援來源';
    reasons.push(`最近一次更新時，樂天回傳金鑰相關錯誤：\`${authError}\`\n\n可能原因：金鑰已過期、貼錯，或「許可されたWebサイト」與 \`RAKUTEN_ORIGIN\` 不符。`);
  }
  if (expires) {
    const left = Math.round((Date.parse(expires) - Date.parse(today)) / 86400000);
    if (Number.isFinite(left) && left <= WARN_DAYS) {
      if (!title) title = left < 0 ? '⚠️ 樂天 API 應用程式已過期' : `⏰ 樂天 API 應用程式將在 ${left} 天後（${expires}）到期`;
      reasons.push(left < 0
        ? `你登記的到期日 ${expires} 已過。`
        : `你登記的到期日是 ${expires}，剩 ${left} 天。`);
    }
  }
  if (!reasons.length) return { need: false, title: '', body: '' };
  const body = `${reasons.join('\n\n')}

## 處理方式
1. 到 https://webservice.rakuten.co.jp 登入，開啟「LightNovelShelf」應用程式，確認有效期限；到期前續期，或重新發行應用程式。
2. 取得新的 Application ID / Access Key 後，到 repo 的 Settings → Secrets and variables → Actions 更新 \`RAKUTEN_APP_ID\`、\`RAKUTEN_ACCESS_KEY\`。
3. 若有新的到期日，同一頁的 **Variables** 分頁更新 \`RAKUTEN_EXPIRES\`（格式 \`YYYY-MM-DD\`）。
4. 處理完成後關閉這則 Issue。

> 在處理完之前，網站會自動改用 Google Books 備援，資料仍會更新，只是準確度較低。`;
  return { need: true, title, body };
}

// 直接執行時
if (import.meta.url === `file://${process.argv[1]}`) {
  let authError = '';
  try {
    const st = JSON.parse(fs.readFileSync('data/state/rakuten-status.json', 'utf8'));
    if (st.ok === false) authError = st.authError || 'unknown';
  } catch {}
  const r = evaluate({ expires: process.env.RAKUTEN_EXPIRES || '', today: todayJST(), authError });
  console.log(r.need ? `需要提醒：${r.title}` : '金鑰狀態正常');
  if (r.need) {
    fs.mkdirSync('.cache', { recursive: true });
    fs.writeFileSync('.cache/key-issue.md', r.body);
    fs.writeFileSync('.cache/key-issue-title.txt', r.title);
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `need=${r.need}\n`);
}
