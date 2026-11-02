#!/bin/sh
# ui-shots — 画面の撮影と機械判定の道具（DevContainer のローカル feature）
#
# ui-design スキル（polish / audit モード）が、画面を撮影し、はみ出し・コントラスト・押せる範囲などを
# 機械で判定するのに使う。power0-onboard が、ブラウザで使う画面のある repo にだけ .devcontainer/ui-shots/ へ
# そのままコピーする。テンプレートの .devcontainer/ui-shots/ も同じ中身（sync-skills.sh の派生コピー）。
# 直すときはスキル側の .claude/skills/power0-onboard/templates/ui-shots/ を直す。
#
# 入れるもの（すべて /usr/local/share/ui-shots の下。PATH には足さない）:
#   - 専用の Node … プロジェクトの Node（古いアプリなら 16 など）とぶつからないように別の場所へ入れる
#                    （beam-dashboard と同じ考え方）
#   - Playwright と axe-core … npm-shrinkwrap.json で版を固定して npm ci で入れる（中身は package-lock.json と
#                    同じ形式。名前を変えてあるのは、多くの repo の .gitignore が package-lock.json を無視していて、
#                    コミットされずに消えるのを避けるため）
#   - Chromium … Playwright が使う版（headless shell）。置き場所も専用にし、どの利用者からも使えるようにする
#   - 日本語フォント … 社内標準の BIZ UDPゴシック。利用者の Windows と同じ書体で撮り、折り返しやはみ出しの
#                      判定をずらさないため。apt に無い OS では Google Fonts の配布物を版とハッシュを固定して取る
# 使うときは ui-shots コマンド（ui-shots --check で道具の状態を確かめられる）。
#
# この install.sh はイメージのビルド時に root で1回だけ動く。失敗してもビルドは止めない
# （ui-shots を実行したときに、足りない物を知らせる）。
NODE_MAJOR=24
DIR=/usr/local/share/ui-shots
HERE="$(cd "$(dirname "$0")" && pwd)"
# Google Fonts（github.com/google/fonts）の ofl/bizudpgothic を、この版とハッシュで固定して取る
FONT_COMMIT=6ce172f74aa355ea43eb964fa4a91570a4d3064d
FONT_REGULAR_SHA256=258d7156c165f2ff774b6efee637c22c3b950de0d8a10e501137061bc8085d01
FONT_BOLD_SHA256=30eba52fc837e8b62c97d4b82e6706583149fb7294e3712dd71a655eaea80a90
warn() { echo "[ui-shots] 警告: $*"; }
mkdir -p "$DIR"

# Playwright が対応していない OS（Debian 11 など）で、Chromium が動くのに要るライブラリ。
# Playwright の一覧（Debian 12 用）から、古い OS にも同じ名前であるものを選んだ
FALLBACK_DEPS="libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 libgbm1
  libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3
  libxkbcommon0 libxrandr2 fonts-liberation fonts-ipafont-gothic"

# apt で入れる。保守の終わった OS（Debian 11 など）では、更新版の置き場（-security）が配布元から消えて
# 404 になり、ふつうに入れると失敗する。そのときは元のリリースの版で入れ直す（-t <コードネーム>）。
APT_READY=0
apt_update() { [ "$APT_READY" = 1 ] || { apt-get update >/dev/null 2>&1 || true; APT_READY=1; }; }   # 一部の取得元が失敗しても、取れた分で続ける
apt_try() {
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$@" >/dev/null 2>&1 && return 0
  codename="$(. /etc/os-release 2>/dev/null; echo "${VERSION_CODENAME:-}")"
  [ -n "$codename" ] && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends -t "$codename" "$@" >/dev/null 2>&1
}
apt_install() { apt_update; apt_try "$@"; }
apt_install_each() {  # まとめて入らなければ1つずつ入れ、入らなかった物だけを知らせる
  apt_update
  apt_try "$@" && return 0
  miss=""
  for p in "$@"; do apt_try "$p" || miss="$miss $p"; done
  [ -z "$miss" ] || warn "入れられなかったパッケージ:$miss"
}

if ! command -v apt-get >/dev/null 2>&1; then
  warn "このイメージ（apt の無い OS）には入れられません。Chromium は Debian / Ubuntu 系でだけ動きます"
  exit 0
fi

# 1) 取得とフォントの道具
apt_install curl ca-certificates fontconfig || warn "curl・fontconfig を入れられませんでした"
case "$(uname -m)" in
  x86_64) ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) ARCH="" ;;
esac

# 2) 日本語フォント（BIZ UDPゴシック）
fetch_font() {  # $1=ファイル名 $2=sha256
  curl -fsSL "https://raw.githubusercontent.com/google/fonts/$FONT_COMMIT/ofl/bizudpgothic/$1" -o "$TMPF/$1" \
    && echo "$2  $TMPF/$1" | sha256sum -c - >/dev/null 2>&1 \
    && cp "$TMPF/$1" "$FONT_DIR/"
}
if ! apt_install fonts-morisawa-bizud-gothic; then
  FONT_DIR=/usr/local/share/fonts/ui-shots
  TMPF="$(mktemp -d)"
  mkdir -p "$FONT_DIR"
  if fetch_font BIZUDPGothic-Regular.ttf "$FONT_REGULAR_SHA256" && fetch_font BIZUDPGothic-Bold.ttf "$FONT_BOLD_SHA256"; then
    curl -fsSL "https://raw.githubusercontent.com/google/fonts/$FONT_COMMIT/ofl/bizudpgothic/OFL.txt" -o "$FONT_DIR/OFL.txt" || true
  else
    warn "BIZ UDPゴシックを取得できませんでした（ネットワークを確かめて、コンテナを再ビルドしてください）"
  fi
  rm -rf "$TMPF"
fi
fc-cache -f >/dev/null 2>&1 || true

# 3) Node（nodejs.org の公式配布物。SHASUMS256.txt で検証してから展開する）
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
else
  warn "Node $NODE_MAJOR を取得できませんでした（CPU: $(uname -m)。ネットワークを確かめて、コンテナを再ビルドしてください）"
fi
rm -rf "$TMP"
NODE="$DIR/node/bin/node"

# 4) Playwright と axe-core（版は npm-shrinkwrap.json で固定）
if [ -x "$NODE" ]; then
  cp "$HERE/package.json" "$HERE/npm-shrinkwrap.json" "$DIR/"
  (cd "$DIR" && PATH="$DIR/node/bin:$PATH" npm ci --omit=dev --no-audit --no-fund --loglevel=error >/dev/null 2>&1) \
    || warn "Playwright・axe-core を入れられませんでした（npm ci が失敗）"
fi
PW="$DIR/node_modules/playwright/cli.js"

# 5) Chromium 本体（撮影は headless だけなので headless shell だけ入れる）。Playwright が対応していない OS では
#    取得を断られるので、Debian 12 用として取得する（Linux 版の Chromium は OS ごとに分かれていない。Debian 11 で動作を確認済み）
# 6) Chromium が動くのに要るライブラリ。Playwright の install-deps は、対応外の OS では「入れられない」と表示しても
#    成功で終わることがあるので、終了コードは信じず「実際に起動できるか」で確かめる。起動しなければ、足りない
#    パッケージの一覧を Playwright に出させて入れ、それでも駄目なら決め打ちの一覧（FALLBACK_DEPS）で入れる
launch_ok() {
  PLAYWRIGHT_BROWSERS_PATH="$DIR/browsers" "$NODE" -e '
    require(process.argv[1]).chromium.launch({ args: ["--disable-dev-shm-usage"] })
      .then((b) => b.close()).catch(() => process.exit(1));' "$DIR/node_modules/playwright" >/dev/null 2>&1
}
if [ -x "$NODE" ] && [ -f "$PW" ]; then
  if ! PLAYWRIGHT_BROWSERS_PATH="$DIR/browsers" "$NODE" "$PW" install --only-shell --no-progress chromium >/dev/null 2>&1; then
    case "$ARCH" in x64) OVERRIDE=debian12-x64 ;; arm64) OVERRIDE=debian12-arm64 ;; *) OVERRIDE="" ;; esac
    if [ -n "$OVERRIDE" ] && PLAYWRIGHT_HOST_PLATFORM_OVERRIDE="$OVERRIDE" PLAYWRIGHT_BROWSERS_PATH="$DIR/browsers" \
         "$NODE" "$PW" install --only-shell --no-progress chromium >/dev/null 2>&1; then
      warn "この OS は Playwright の対応外なので、Debian 12 用の Chromium を入れました"
    else
      warn "Chromium を取得できませんでした（ネットワークを確かめて、コンテナを再ビルドしてください）"
    fi
  fi
  "$NODE" "$PW" install-deps chromium >/dev/null 2>&1 || true
  if ! launch_ok; then
    apt_update
    list="$("$NODE" "$PW" install-deps --dry-run chromium 2>/dev/null | sed -n 's/^  \([a-z0-9][a-z0-9.+-]*\)$/\1/p' | tr '\n' ' ')"
    [ -z "$list" ] || apt_install_each $list
    launch_ok || apt_install_each $FALLBACK_DEPS
    launch_ok || warn "Chromium が起動しません（足りないライブラリがあります。ui-shots --check で理由を確かめてください）"
  fi
fi
rm -rf /var/lib/apt/lists/*
chmod -R a+rX "$DIR" 2>/dev/null || true

# 7) コマンド ui-shots
cat > /usr/local/bin/ui-shots <<'EOF'
#!/usr/bin/env bash
# 画面の撮影と機械判定（ui-design スキル用）。専用の Node で、渡されたスクリプトを動かす。
# プロジェクトの Node は使わず、変えもしない。
#   ui-shots --check              道具の状態を確かめる
#   ui-shots <script.cjs> [引数]   スクリプトを動かす（ui-design の scripts/capture.cjs・review.cjs など）
UI_SHOTS_HOME=/usr/local/share/ui-shots
NODE="$UI_SHOTS_HOME/node/bin/node"
REBUILD="コンテナを再ビルドしてください（コマンドパレット → Dev Containers: Rebuild Container）"
export UI_SHOTS_HOME PLAYWRIGHT_BROWSERS_PATH="$UI_SHOTS_HOME/browsers"

if [ ! -x "$NODE" ] || [ ! -f "$UI_SHOTS_HOME/node_modules/playwright/package.json" ]; then
  echo "[ui-shots] 道具がそろっていません（専用の Node または Playwright が無い）。$REBUILD" >&2
  exit 1
fi

check() {
  local ok=1 v
  echo "Node:        $("$NODE" --version)（専用。プロジェクトの Node とは別）"
  for m in playwright axe-core; do
    v="$("$NODE" -p "require('$UI_SHOTS_HOME/node_modules/$m/package.json').version" 2>/dev/null)" || { v="なし"; ok=0; }
    printf '%-12s %s\n' "$m:" "$v"
  done
  if out="$("$NODE" -e '
      const { chromium } = require(process.env.UI_SHOTS_HOME + "/node_modules/playwright");
      (async () => {
        const b = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
        const p = await b.newPage();
        await p.setContent("<p style=\"font-family:\x27BIZ UDPGothic\x27\">日本語の表示</p>");
        console.log(b.version()); await b.close();
      })().catch(e => { console.log("起動できない: " + String(e.message).split("\n")[0]); process.exit(1); });' 2>&1)"; then
    echo "Chromium:    $out（起動できた）"
  else
    echo "Chromium:    $out"; ok=0
  fi
  if fc-list 2>/dev/null | grep -qi "BIZ UDPGothic"; then
    echo "フォント:    BIZ UDPゴシック あり（日本語の書体 $(fc-list :lang=ja family 2>/dev/null | sort -u | wc -l) 種）"
  else
    echo "フォント:    BIZ UDPゴシック なし（日本語の書体 $(fc-list :lang=ja family 2>/dev/null | sort -u | wc -l) 種）"; ok=0
  fi
  if [ "$ok" = 1 ]; then echo "[ui-shots] 準備完了"; else echo "[ui-shots] 足りない物があります。$REBUILD" >&2; return 1; fi
}

case "${1:-}" in
  --check) check; exit $? ;;
  ""|-h|--help) sed -n '2,5p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
esac
exec "$NODE" "$@"
EOF
chmod 0755 /usr/local/bin/ui-shots
