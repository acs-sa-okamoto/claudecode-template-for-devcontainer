#!/usr/bin/env bash
# beam タスクダッシュボードを起動する。
#
# モードは自動判定する（環境変数 BEAM_DASHBOARD_MODE で明示指定も可）:
#   - このディレクトリの .env に NOTION_API_TOKEN と NOTION_PARENT_PAGE_ID が
#     両方とも設定されていれば → full（Notion 連携あり。.env を読み込む）
#   - そうでなければ                                         → view（閲覧専用・Notion 不要）
#
# 注: 以前は親プロジェクトの ../../.env を読んでいたが、ダッシュボード専用の設定を
#     プロジェクトルートに置くと、同じリポジトリで動くアプリのフレームワーク（例: Next.js は
#     ルートの .env を自動で読み込む）に意図せず混入する。PORT のような一般的な名前の変数が
#     衝突するため、設定はダッシュボードと同じ場所に置く（package.json の
#     `--env-file-if-exists=.env` と配置を揃える）。
#
# 共通:
#   - このスクリプトのあるディレクトリ（.beam/dashboard）を CWD にして起動する。
#     → 静的 UI は ./dist/web、メタ DB は ./data/app.db（ダッシュボード専用）に分離される。
#   - SOURCE_DB_PATH は親プロジェクトの data/tasks.db を指す（../../data/tasks.db）。
set -euo pipefail

cd "$(dirname "$0")"

# 初回・未ビルド時の自己復旧: dist が無ければ依存導入とビルドを行う。
# （post-create が未実行/失敗、または folderOpen タスクが先行した場合の保険）
if [ ! -f dist/server/index.js ]; then
  echo "[beam dashboard] ビルド成果物が無いため初回ビルドを実行します（数分かかる場合があります）..."
  corepack enable 2>/dev/null || true
  [ -d node_modules ] || pnpm install
  pnpm build
fi

ENVFILE=".env"

# モード自動判定（明示指定があれば優先）。
MODE="${BEAM_DASHBOARD_MODE:-}"
if [ -z "$MODE" ]; then
  if [ -f "$ENVFILE" ] \
    && grep -qE '^[[:space:]]*NOTION_API_TOKEN=[^[:space:]]' "$ENVFILE" \
    && grep -qE '^[[:space:]]*NOTION_PARENT_PAGE_ID=[^[:space:]]' "$ENVFILE"; then
    MODE="full"
  else
    MODE="view"
  fi
fi
export BEAM_DASHBOARD_MODE="$MODE"
export SOURCE_DB_PATH="${SOURCE_DB_PATH:-../../data/tasks.db}"
export PORT="${BEAM_DASHBOARD_PORT:-${PORT:-3939}}"

# full モード（Notion 連携）では親プロジェクトの .env から NOTION_* 等を読み込む。
NODE_ARGS=()
if [ "$MODE" = "full" ]; then
  if [ -f "$ENVFILE" ]; then
    NODE_ARGS+=(--env-file="$ENVFILE")
    echo "[beam dashboard] full モード（Notion 連携）で起動します。$ENVFILE を読み込みます。"
  else
    echo "[beam dashboard] full モードですが $ENVFILE がありません。view にフォールバックします。" >&2
    export BEAM_DASHBOARD_MODE="view"
  fi
else
  echo "[beam dashboard] view モード（閲覧専用・Notion 連携なし）で起動します。"
fi

# 既存インスタンスがあれば停止してから起動し直す（再起動＝再表示用。外部コマンド非依存）。
# これにより VS Code がポートを再検出し、Simple Browser タブが再び開く。
PIDFILE="dashboard.pid"
if [ -f "$PIDFILE" ]; then
  OLD="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [ -n "${OLD:-}" ] && kill -0 "$OLD" 2>/dev/null; then
    kill "$OLD" 2>/dev/null || true
    for _ in 1 2 3 4 5; do kill -0 "$OLD" 2>/dev/null || break; sleep 0.2; done
  fi
fi

mkdir -p data
node ${NODE_ARGS[@]+"${NODE_ARGS[@]}"} dist/server/index.js &
SRV=$!
echo "$SRV" > "$PIDFILE"

# VS Code のタスクとして起動された場合、ホストの既定ウェブブラウザでも新規タブを開く。
# - Simple Browser（VS Code 内タブ）は forwardPorts の onAutoForward=openPreview が別途開く。
# - $BROWSER は VS Code Remote が helpers/browser.sh（ホスト側でブラウザを開くヘルパ）を
#   指すよう設定する。手動実行や $BROWSER 未設定の環境では何もしない（Simple Browser のみ）。
# - 二重起動対策: VS Code は folderOpen タスクをリビルド時などに二重発火することがあり、
#   そのままだとタブが2つ開く。直近に開いた記録（マーカー）から 30 秒以内ならスキップする。
if [ -n "${BROWSER:-}" ]; then
  (
    BROWSER_MARK="${TMPDIR:-/tmp}/beam-dashboard-browser-opened"
    now="$(date +%s)"
    last=0
    [ -f "$BROWSER_MARK" ] && last="$(date -r "$BROWSER_MARK" +%s 2>/dev/null || echo 0)"
    if [ "$(( now - last ))" -ge 30 ]; then
      touch "$BROWSER_MARK"   # 先にスロットを確保して二重発火の2本目を抑止する
      # サーバ応答を最大 5 秒待ってから開く（空タブ・接続エラー回避）。
      for _ in 1 2 3 4 5 6 7 8 9 10; do
        curl -sf -o /dev/null "http://127.0.0.1:${PORT}/health" && break
        sleep 0.5
      done
      "$BROWSER" "http://localhost:${PORT}/" >/dev/null 2>&1 || true
    fi
  ) &
fi

# サーバーをフォアグラウンドに張り付ける（タスク端末が生きている間サーバーも生きる）。
wait "$SRV"
