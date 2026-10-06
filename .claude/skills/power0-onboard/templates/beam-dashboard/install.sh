#!/bin/sh
# beam-dashboard — タスクダッシュボード専用の Node（DevContainer のローカル feature）
#
# power0-onboard が、ダッシュボード（.beam/dashboard/）を入れるときだけ .devcontainer/beam-dashboard/ に
# そのままコピーする。どのリポジトリでも中身は同じなので、ここでは手を加えない（直すときはスキル側の
# .claude/skills/power0-onboard/templates/beam-dashboard/ を直す）。
#
# なぜ専用の Node か: ダッシュボードは Node 24 で動く（.beam/dashboard/package.json の engines）。
# 公式の node feature で入れると PATH の先頭に入り、プロジェクト自身の Node（レガシーなら 16 や 18 など）
# まで置き換わってしまう。ここではプロジェクトとは別の場所に入れ、PATH には足さない。
# ダッシュボードは beam-dashboard コマンドで起動する（この Node を使って .beam/dashboard/run.sh を動かす）。
#
# この install.sh はイメージのビルド時に root で1回だけ動く。失敗してもビルドは止めない
# （beam-dashboard を実行したときに、足りない物を知らせる）。
set -e
NODE_MAJOR=24   # .beam/dashboard/package.json の engines に合わせる
DIR=/usr/local/share/beam-dashboard
warn() { echo "[beam-dashboard] 警告: $*"; }

# apt で入れる。保守の終わった OS（Debian 11 など）では、更新版の置き場（-security）が配布元から消えて
# 404 になり、ふつうに入れると失敗する。そのときは元のリリースの版で入れ直す（-t <コードネーム>）。
apt_install() {
  apt-get update >/dev/null 2>&1 || true   # 一部の取得元が失敗しても、取れた分で続ける
  if ! DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$@"; then
    codename="$(. /etc/os-release 2>/dev/null; echo "${VERSION_CODENAME:-}")"
    [ -n "$codename" ] || return 1
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends -t "$codename" "$@" || return 1
  fi
  rm -rf /var/lib/apt/lists/*
}

# 1) 取得とビルドに要る道具（make・g++・python3 は、better-sqlite3 のビルド済みバイナリが使えないとき用）
need=""
for c in curl make g++ python3; do command -v "$c" >/dev/null 2>&1 || need="$need $c"; done
if [ -n "$need" ]; then
  if command -v apt-get >/dev/null 2>&1; then
    apt_install $need ca-certificates || warn "入れられませんでした:$need"
  else
    warn "このイメージには自動で入れられません:$need"
  fi
fi

# 2) Node（nodejs.org の公式配布物。SHASUMS256.txt で検証してから展開する）
case "$(uname -m)" in
  x86_64) ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) ARCH="" ;;
esac
BASE="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
TMP="$(mktemp -d)"
FILE=""
if [ -n "$ARCH" ] && curl -fsSL "$BASE/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt"; then
  FILE="$(awk -v f="linux-$ARCH.tar.gz" 'substr($2, length($2) - length(f) + 1) == f {print $2; exit}' "$TMP/SHASUMS256.txt")"
fi
if [ -n "$FILE" ] && curl -fsSL "$BASE/$FILE" -o "$TMP/$FILE" \
   && (cd "$TMP" && grep " $FILE\$" SHASUMS256.txt | sha256sum -c - >/dev/null 2>&1); then
  rm -rf "$DIR/node" && mkdir -p "$DIR/node"
  tar -xzf "$TMP/$FILE" -C "$DIR/node" --strip-components=1
  # pnpm の入口（corepack）を、この Node の bin にだけ置く
  PATH="$DIR/node/bin:$PATH" "$DIR/node/bin/corepack" enable || warn "corepack enable に失敗しました"
else
  warn "Node $NODE_MAJOR を取得できませんでした（CPU: $(uname -m)。ネットワークを確かめて、コンテナを再ビルドしてください）"
fi
rm -rf "$TMP"

# 3) 起動コマンド beam-dashboard
cat > /usr/local/bin/beam-dashboard <<'EOF'
#!/usr/bin/env bash
# タスクダッシュボードを、ダッシュボード専用の Node で起動する（プロジェクトの Node は使わず、変えもしない）
NODE_DIR=/usr/local/share/beam-dashboard/node/bin
if [ ! -x "$NODE_DIR/node" ]; then
  echo "[beam-dashboard] ダッシュボード用の Node がありません。コンテナを再ビルドしてください（コマンドパレット → Dev Containers: Rebuild Container）" >&2
  exit 1
fi
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
RUN="$ROOT/.beam/dashboard/run.sh"
if [ ! -f "$RUN" ]; then
  echo "[beam-dashboard] $RUN がありません（リポジトリの中で実行してください）" >&2
  exit 1
fi
# ダッシュボードが求める Node と食い違っていたら知らせる（ダッシュボード側が新しい Node に上がったとき用）
want="$(grep -o '"node": *"[0-9]*' "$ROOT/.beam/dashboard/package.json" 2>/dev/null | grep -o '[0-9]*$')"
have="$("$NODE_DIR/node" -p 'process.versions.node.split(".")[0]')"
if [ -n "$want" ] && [ "$want" != "$have" ]; then
  echo "[beam-dashboard] 注意: ダッシュボードは Node $want 向けですが、専用の Node は $have です。" >&2
  echo "  スキル側の .claude/skills/power0-onboard/templates/beam-dashboard/install.sh の NODE_MAJOR を直し、" >&2
  echo "  /power0-onboard で .devcontainer/beam-dashboard/ を置き換えてから、コンテナを再ビルドしてください。" >&2
fi
export PATH="$NODE_DIR:$PATH"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
exec bash "$RUN" "$@"
EOF
chmod 0755 /usr/local/bin/beam-dashboard
