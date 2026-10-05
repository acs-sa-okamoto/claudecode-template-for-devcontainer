#!/usr/bin/env bash
set -euo pipefail

# beam ダッシュボード（タスクビューア）の本体は .beam/dashboard/ に自己完結で配置されている。
# プロジェクトのルート（src/）は「開発する製品」用に空けてあるため、補助ツールはここでビルド/起動する。
DASH=.beam/dashboard

corepack enable

# ルート（製品コード側）の依存を先に入れる。
# 【重要】これが無いとルートに pnpm-lock.yaml が生成されない。lockfile が無いと
#   Vercel はパッケージマネージャを判定できず、packageManager の pnpm 指定を無視して
#   npm install にフォールバックする（Vercel 公式ドキュメントの検出順に明記されている）。
#   その結果ローカルと本番で別バージョンが入り得る＝ガードレール P1「依存関係は
#   lockfile で固定」に反する。実際にこの事故が起きたため post-create に追加した。
# 【中断しない理由】ここで落とすと後続の gh 認証・gh-stack 導入まで到達せず、
#   beam-sync が使えないコンテナができあがる。依存の失敗は警告に留め、続行する。
echo "==> Installing app dependencies (repository root)"
pnpm install || echo "   [warn] ルートの pnpm install に失敗しました。手動で 'pnpm install' を実行し、生成された pnpm-lock.yaml をコミットしてください。"

echo "==> Installing beam dashboard dependencies ($DASH)"
( cd "$DASH" && pnpm install )                # ツールのルートで実行（corepack が $DASH の pnpm 固定を解決） better-sqlite3 をネイティブビルド

echo "==> Installing Playwright browsers (Chromium) with system dependencies"
sudo npx -y playwright install --with-deps chromium || echo "   [warn] Playwright のインストールに失敗しました（E2E テスト用。ダッシュボード起動には不要なため続行します）"

echo "==> Building beam dashboard ($DASH)"
( cd "$DASH" && pnpm build )                   # ツールのルートで実行。server + web を $DASH/dist へ

echo "==> Preparing data directories"
mkdir -p data "$DASH/data"                     # ソース tasks.db はルート data/、ダッシュボードのメタ DB は $DASH/data/

echo "==> Configuring GitHub auth (gh + git)"
# 認証は WSL の ~/.config/gh を bind マウントして共有する（devcontainer.json の mounts 参照）。
if gh auth status >/dev/null 2>&1; then
  # git push / clone も gh の認証を使うようにする（gh を git の認証ヘルパに登録）
  gh auth setup-git || echo "   [warn] gh auth setup-git に失敗しました"
  # git identity が未設定なら gh アカウントから自動設定（GitHub no-reply メール）
  if [ -z "$(git config --global user.name || true)" ]; then
    gh_login="$(gh api user --jq .login 2>/dev/null || true)"
    gh_id="$(gh api user --jq .id 2>/dev/null || true)"
    if [ -n "$gh_login" ] && [ -n "$gh_id" ]; then
      git config --global user.name  "$gh_login"
      git config --global user.email "${gh_id}+${gh_login}@users.noreply.github.com"
      echo "   git identity: ${gh_login} <${gh_id}+${gh_login}@users.noreply.github.com>"
    fi
  fi
else
  echo "   [warn] gh 未認証。WSL で 'gh auth login' を実行してください（コンテナはその認証をマウントして共有します）。"
fi

echo "==> Installing gh extensions"
# gh-stack: GitHub ネイティブの Stacked Pull Requests を操作する拡張。
# beam-sync がフェーズごとの PR をスタックに積み（gh stack link）、
# アトミックにマージする（gh stack merge）ために必須。無いと beam-sync は中断する。
if gh extension list 2>/dev/null | grep -q 'gh-stack'; then
  echo "   gh-stack: already installed"
elif gh extension install github/gh-stack 2>/dev/null; then
  echo "   gh-stack: installed"
else
  echo "   [warn] gh-stack の導入に失敗しました。beam-sync は 'gh extension install github/gh-stack' を要求します。"
  echo "          （gh 未認証だと失敗します。認証後にこのスクリプトを再実行してください）"
fi

echo "==> Done"
echo "    beam ダッシュボードは 'bash .beam/dashboard/run.sh' で起動（既定 http://localhost:3939）。"
echo "    devcontainer では postStart で自動起動・ポート転送されます。"