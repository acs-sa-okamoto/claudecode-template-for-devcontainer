#!/usr/bin/env bash
# power-base — コンテナが起動するたびに動く（何度動いても結果は同じ）
#   0. Claude Code があるか確かめる（ビルド時に入れられなかったら知らせる）
#   1. gh が GitHub にログインできているか確かめる（ホストの ~/.config/gh を共有している）
#   2. git が gh のログインを使うよう登録する（gh auth setup-git）
#   3. git の名前とメールが無ければ、gh のアカウントから設定する
#   4. gh-stack（スタックド PR の拡張。power4 以降の PR 作成に必須）を入れる
# どこで失敗してもコンテナの起動は止めない（警告して続ける）。手で何度実行してもよい:
#   bash /usr/local/share/power-base/setup.sh
set -u
say()  { printf '[power-base] %s\n' "$*"; }
warn() { printf '[power-base] ⚠️  %s\n' "$*"; }

command -v claude >/dev/null 2>&1 \
  || warn "Claude Code がありません。コンテナを再ビルドしてください（コマンドパレット → Dev Containers: Rebuild Container）"

if ! command -v gh >/dev/null 2>&1; then
  warn "gh が見つかりません。コンテナを再ビルドしてください（コマンドパレット → Dev Containers: Rebuild Container）"
  exit 0
fi

login="$(gh api user --jq .login 2>/dev/null || true)"
if [ -z "$login" ]; then
  warn "GitHub にログインできていません（未ログインか、ネットワークに繋がっていません）。"
  warn "このままでは power の PR 作成（power4 以降）が止まります。直し方:"
  warn "  1) WSL のターミナルで: gh auth login"
  warn "  2) このコンテナのターミナルで: bash /usr/local/share/power-base/setup.sh"
  warn "  コンテナは WSL の ~/.config/gh をそのまま使うので、再ビルドは要りません。"
  warn "  WSL では gh auth status が通るのにここだけ失敗するときは、ログイン情報がキーリングに"
  warn "  保存されていてコンテナから読めません。WSL で gh auth login --insecure-storage をやり直してください。"
  exit 0
fi
say "GitHub: $login としてログイン済み"

ok=1
gh auth setup-git >/dev/null 2>&1 \
  || { warn "gh auth setup-git に失敗しました（git push に gh のログインが使われません）"; ok=0; }

if [ -z "$(git config --global user.name 2>/dev/null || true)" ]; then
  id="$(gh api user --jq .id 2>/dev/null || true)"
  if [ -n "$id" ]; then
    git config --global user.name "$login"
    git config --global user.email "${id}+${login}@users.noreply.github.com"
    say "git の名前とメールを設定しました: $login <${id}+${login}@users.noreply.github.com>"
  fi
fi

if gh stack --help >/dev/null 2>&1; then
  :
elif gh extension install github/gh-stack >/dev/null 2>&1; then
  say "gh-stack を入れました"
else
  warn "gh-stack を入れられませんでした。手で: gh extension install github/gh-stack"
  ok=0
fi

command -v sqlite3 >/dev/null 2>&1 \
  || warn "sqlite3 がありません（power4 はタスク DB を作らずに進みます）"

if [ "$ok" = 1 ]; then say "準備完了"; else warn "一部が整っていません（上の警告を参照）"; fi
