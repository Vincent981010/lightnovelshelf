#!/usr/bin/env bash
# 每個資料來源跑完就立刻 commit，不必等整個流程結束（首次執行很久，這樣可以逐步看到資料）
set -u
LABEL="${1:-data}"
git config user.name  "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add data
if git diff --cached --quiet; then
  echo "[$LABEL] 沒有變動"
  exit 0
fi
git commit -m "chore: update data ($LABEL) $(date -u +%F)"
for i in 1 2 3; do
  git pull --rebase --autostash && git push && break
  echo "push 失敗，重試 $i"; sleep 5
done
# 用 GITHUB_TOKEN 推送不一定會觸發 Pages 重新部署，主動要求一次
gh api --method POST "repos/${GITHUB_REPOSITORY}/pages/builds" >/dev/null 2>&1 || true
echo "[$LABEL] 已 commit"
