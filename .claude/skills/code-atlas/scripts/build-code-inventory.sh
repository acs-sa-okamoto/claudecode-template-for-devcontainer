#!/usr/bin/env bash
# build-code-inventory.sh — リポジトリの「目録」を機械的に作る
#
# 目的: コードを読み始める前に、「どこに何がどれだけあるか」を 1 秒程度でつかむ。
#       AI が全体を歩き回って数える手間を無くし、読まなくてよい場所（翻訳・同梱ライブラリ・生成物）を先に外す。
#
# 使い方（リポジトリ内で実行。結果は標準出力に Markdown で出る）:
#   bash <このスキル>/scripts/build-code-inventory.sh > docs/code-atlas/inventory.md
#   bash <このスキル>/scripts/build-code-inventory.sh --top 40
#
# 依存: bash・git・awk・sort のみ（mawk でも動く）。リポジトリには何も書き込まない。一時ファイルも作らない。
# 終了コード: 0=成功 / 2=実行エラー（git 外など）

set -euo pipefail

TOP=25
while [ $# -gt 0 ]; do
  case "$1" in
    --top) TOP="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "ERROR: 不明な引数: $1" >&2; exit 2 ;;
  esac
done
[[ "$TOP" =~ ^[0-9]+$ ]] || { echo "ERROR: --top は数値で指定してください: $TOP" >&2; exit 2; }

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "ERROR: git リポジトリ内で実行してください。" >&2; exit 2; }
cd "$ROOT"

G() { git -c core.quotepath=off "$@"; }

collect() {
  echo "@@SECTION tree"
  G ls-tree -r -l HEAD
  echo "@@SECTION lines"
  G grep -I -c '' HEAD -- . || true
}

# POSIX awk の範囲で書く（プログラム中に単引用符を使わない）。
PROG='
function base(p,   b) { b = p; sub(/^.*\//, "", b); return b }
function depth(p,   t) { t = p; return gsub(/\//, "/", t) }
function ext(p,   b) {
  b = base(p)
  if (b ~ /^[^.]+$/ || b ~ /^\.[^.]*$/) return "(拡張子なし)"
  sub(/^.*\./, ".", b); return b
}
function dirn(p, k,   n, sg, i, s) {
  n = split(p, sg, "/"); if (n == 1) return "."
  s = sg[1]; for (i = 2; i < n && i <= k; i++) s = s "/" sg[i]
  return s
}
# 探索から外す候補かどうか。空文字なら対象。
function reason(p, by, ln,   b) {
  b = base(p)
  if (p ~ /(^|\/)(node_modules|vendor|vendors|third_party|third-party|bower_components)\//) return "同梱ライブラリ"
  if (b ~ /\.min\.(js|css)$/ || b ~ /[-.]bundle\.(js|css)$/ || b ~ /\.map$/) return "同梱ライブラリ"
  if (b ~ /^(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock|bun\.lockb|poetry\.lock|uv\.lock|Pipfile\.lock|Cargo\.lock|Gemfile\.lock|composer\.lock|go\.sum|flake\.lock)$/) return "ロックファイル"
  if (p ~ /(^|\/)(i18n|locales|locale|translations|lang|langs)\//) return "翻訳"
  if (p ~ /(^|\/)(dist|build|out|target|coverage|generated|__generated__)\//) return "生成物"
  if (b ~ /_pb2\.py$/ || b ~ /\.pb\.go$/ || b ~ /\.generated\.[a-z]+$/ || b ~ /\.snap$/) return "生成物"
  if (ln > 0 && by > 20000 && by / ln > 300) return "1行が極端に長い"
  if (b ~ /\.(json|csv|tsv|xml|ipynb)$/ && ln > 2000) return "データ"
  if (b ~ /\.svg$/) return "画像"
  return ""
}
function rawreason(p) { return reason(p, (p in bytes) ? bytes[p] : 0, (p in lines) ? lines[p] : 0) }
# 同梱ライブラリと同じフォルダにある .js / .css / .html も候補にする（同梱した UI 一式など）。
function mark_vendor_dirs(   p, d) {
  if (vdone) return
  vdone = 1
  for (p in exists) if (index(p, "/") && rawreason(p) == "同梱ライブラリ") { d = p; sub(/\/[^\/]*$/, "", d); vdir[d] = 1 }
}
function rz(p,   d) {
  if (p in rc) return rc[p]
  mark_vendor_dirs()
  rc[p] = rawreason(p)
  if (rc[p] == "" && index(p, "/") && base(p) ~ /\.(js|css|html)$/) { d = p; sub(/\/[^\/]*$/, "", d); if (d in vdir) rc[p] = "同梱ライブラリと同じフォルダ" }
  return rc[p]
}
# テストと見られるファイルかどうか（除外はせず、別に数える）。
function istest(p,   b) {
  # docs/ の下は文書（beam/power の docs/spec/ など）。テストのディレクトリ名と一致してもテストではない。
  if (p ~ /^docs\//) return 0
  b = base(p)
  if (b ~ /\.(spec|test)\.[a-z]+$/ || b ~ /^test_.*\.py$/ || b ~ /_test\.(py|go)$/ || b ~ /Tests?\.(java|kt|cs)$/) return 1
  if (p ~ /(^|\/)(__tests__|__mocks__|tests|test|e2e|spec|specs)\//) return 1
  return 0
}
# 文章のファイルかどうか（Markdown などと docs/ の下）。規模の区分はコードの行数で決めるため、別に数える。
function isprose(p,   b) {
  if (p ~ /^docs\//) return 1
  b = base(p)
  if (b ~ /\.(md|markdown|mdx|txt|rst|adoc|org)$/) return 1
  return 0
}
# 規約や全体の説明が書かれていそうな文書かどうか。
function isdoc(p,   b, d) {
  b = base(p); d = depth(p)
  if (b ~ /^(AGENTS|CLAUDE|GEMINI|CONTRIBUTING|ARCHITECTURE|CONTEXT|DESIGN|DEVELOPMENT|CODING_GUIDELINES|STYLEGUIDE|SECURITY|UPGRADING)(\.[A-Za-z-]+)?\.md$/ && d <= 2) return 1
  if (b ~ /^README(\.[A-Za-z-]+)?\.md$/ && d <= 1) return 1
  if (b == ".cursorrules" || b == "copilot-instructions.md") return 1
  if (p ~ /(^|\/)(adr|adrs|decisions)\/[^\/]+\.md$/) return 1
  if (p ~ /^docs\/(rule|rules|architecture)\/[^\/]+\.md$/) return 1
  return 0
}
# パッケージやビルドの境目を示すファイルかどうか。
function ismanifest(p,   b) {
  if (depth(p) > 3) return 0
  b = base(p)
  if (b ~ /^(package\.json|pnpm-workspace\.yaml|turbo\.json|nx\.json|lerna\.json|pyproject\.toml|setup\.py|requirements\.txt|go\.mod|Cargo\.toml|pom\.xml|build\.gradle|build\.gradle\.kts|settings\.gradle|settings\.gradle\.kts|Gemfile|composer\.json|mix\.exs|Makefile|Dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$/) return 1
  if (b ~ /\.(csproj|sln|fsproj)$/) return 1
  return 0
}
/^@@SECTION / { sec = $2; next }
sec == "tree" {
  tab = index($0, "\t"); path = substr($0, tab + 1); split(substr($0, 1, tab - 1), f, " ")
  if (f[2] != "blob") next
  bytes[path] = f[4] + 0; sha[path] = f[3]; exists[path] = 1; nfiles++; next
}
sec == "lines" {
  s = substr($0, 6); n = split(s, la, ":"); c = la[n]
  path = substr(s, 1, length(s) - length(c) - 1)
  lines[path] = c + 0; next
}
END {
  for (p in exists) {
    r = rz(p); e = ext(p); istext = (p in lines); L = istext ? lines[p] : 0
    if (istext) { ntext++; tot += L; ef[e]++; el[e] += L }
    if (isdoc(p)) printf "DOC\t%d\t%s\n", L, p
    if (r != "") { k = r SUBSEP dirn(p, 3); xf[k]++; xl[k] += L; xb[k] += bytes[p]; continue }
    if (ismanifest(p)) printf "MAN\t%s\n", p
    if (!istext) continue
    T = istest(p)
    kept += L; nkept++; ekf[e]++; ekl[e] += L
    if (T) { tfiles++; tlines += L; etl[e] += L }
    else if (isprose(p)) { pfiles++; plines += L }
    else { cfiles++; clines += L }
    if (L >= 1000 && !T && !isprose(p)) printf "BIG\t%d\t%s\n", L, p
    # 中身が同じファイル（写し）。小さいファイルは偶然の一致が多いので数えない
    if (bytes[p] >= 200) { sc[sha[p]]++; sz[sha[p]] = bytes[p]; sl[sha[p]] = sl[sha[p]] "\t" p }
    n = split(p, seg, "/")
    if (n == 1) { dirf["."]++; dirl["."] += L; continue }
    pre = ""
    for (d = 1; d < n && d <= 4; d++) {
      pre = (d == 1) ? seg[1] : pre "/" seg[d]
      df[pre]++; dl[pre] += L; dd[pre] = d; de[pre SUBSEP e] += L
      if (T) dt[pre] += L
      if (d < n - 1) dc[pre] = 1
    }
    if (n - 1 <= 4) { dirf[pre]++; dirl[pre] += L; if (T) dirt[pre] += L }
  }
  for (k in de) { split(k, kk, SUBSEP); if (de[k] > bestl[kk[1]]) { bestl[kk[1]] = de[k]; beste[kk[1]] = kk[2] } }
  printf "META\t%d\t%d\t%d\t%d\t%d\t%d\t%d\t%d\t%d\t%d\t%d\n", nfiles, ntext, tot, nkept, kept, tfiles, tlines, cfiles, clines, pfiles, plines
  for (k in sc) if (sc[k] > 1) printf "DUP\t%d\t%d%s\n", sc[k], sz[k], sl[k]
  for (e in el) printf "EXT\t%s\t%d\t%d\t%d\t%d\t%d\n", e, ef[e], el[e], ekf[e], ekl[e], etl[e]
  for (k in xf) { split(k, kk, SUBSEP); printf "EXC\t%s\t%s\t%d\t%d\t%d\n", kk[1], kk[2], xf[k], xl[k], xb[k] }
  for (p in df) printf "DIR\t%d\t%s\t%d\t%d\t%s\t%d\t%d\n", dd[p], p, df[p], dl[p], beste[p], (p in dc), dt[p]
  for (p in dirf) printf "DIRECT\t%s\t%d\t%d\t%d\n", p, dirf[p], dirl[p], dirt[p]
}
'

DATA="$(collect | awk "$PROG")"
rec() { printf '%s\n' "$DATA" | awk -F'\t' -v t="$1" '$1 == t'; }
# ルート直下のファイルは ./ を付ける（根拠の検証スクリプトが「/ を含む」ことを検出条件にしているため）。
tick() { awk -F'\t' -v OFS='\t' -v c="$1" '{ p = $c; if (index(p, "/") == 0) p = "./" p; $c = "`" p "`"; print }'; }

SHA="$(G rev-parse HEAD)"
SHA_DATE="$(G log -1 --format=%cs HEAD)"
NAME="$(basename "$ROOT")"
TAB="$(printf '\t')"
read -r NFILES NTEXT TOT NKEPT KEPT TFILES TLINES CFILES CLINES PFILES PLINES <<EOF
$(rec META | cut -f2- | tr '\t' ' ')
EOF
SRC=$((KEPT - TLINES))

# 規模の区分（目安）: 全部を深く読めるか、区画を選んで読むかの判断に使う。
# コード（テスト・文章を除く）の行数で決める。beam・power のリポジトリは docs/ の文書が
# コードの何倍にもなるので、文書を含めると区分が実態より大きく出る。
SIZE="小"
[ "$CLINES" -ge 50000 ] && SIZE="中"
[ "$CLINES" -ge 300000 ] && SIZE="大"

cat <<EOF
# コードの目録: ${NAME}

> **役割**: リポジトリの規模と配置を機械的に集計したもの。「どこを見るか」を決める手がかりにする。
> **信頼性**: すべて 🟡（名前と行数だけで判定している）。全体像や規約の根拠には使わない。
> **検証リビジョン**: \`${SHA}\`（${SHA_DATE}）
> **作り直し方**: \`build-code-inventory.sh\` を実行して、このファイルを上書きする（手で編集しない）。

## 1. 規模

- 追跡しているファイル: ${NFILES}（うちテキスト ${NTEXT}・${TOT} 行）
- 探索から外す候補を除いたテキスト: ${NKEPT} ファイル・${KEPT} 行
- うちテストと見られるもの: ${TFILES} ファイル・${TLINES} 行
- テスト以外: ${SRC} 行（うち文章〔Markdown など・\`docs/\` の下〕${PFILES} ファイル・${PLINES} 行）
- **コード（テスト・文章を除く）: ${CFILES} ファイル・${CLINES} 行 → 規模の区分（目安）: ${SIZE}**（コードの行数で判定。小: 5 万行未満／中: 30 万行未満／大: それ以上）

| 拡張子 | ファイル数 | 行数 | 除外後のファイル数 | 除外後の行数 | うちテストの行数 |
|---|---:|---:|---:|---:|---:|
EOF
rec EXT | LC_ALL=C sort -t"$TAB" -k6,6nr -k4,4nr | awk 'NR <= 12' \
  | awk -F'\t' '{ printf "| `%s` | %d | %d | %d | %d | %d |\n", $2, $3, $4, $5, $6, $7 }'

cat <<EOF

## 2. 探索から外す候補

名前と形（1行の長さ・行数）だけで判定しています。外してよいかは人が決めます。

| 理由 | 場所 | ファイル数 | 行数 | サイズ(KB) |
|---|---|---:|---:|---:|
EOF
rec EXC | LC_ALL=C sort -t"$TAB" -k2,2 -k6,6nr | awk 'NR <= 40' \
  | awk -F'\t' '{ printf "| %s | `%s/` | %d | %d | %d |\n", $2, $3, $4, $5, $6 / 1024 }'

cat <<EOF

## 3. ディレクトリの俯瞰（探索から外す候補を除く）

全体の 10% を超えるディレクトリは、もう1階層だけ開いています（最大4階層。\`docs/\` の下は2階層まで）。区画を決めるときの材料です。

| ディレクトリ | ファイル数 | 行数 | 割合 | うちテストの行数 | 主な拡張子 |
|---|---:|---:|---:|---:|---|
EOF
printf '%s\n' "$DATA" | awk -F'\t' -v TH=0.10 '
  $1 == "META" { kept = $6 }
  $1 == "DIR" { d[$3] = $2; f[$3] = $4; l[$3] = $5; e[$3] = $6; c[$3] = $7; t[$3] = $8; order[++n] = $3 }
  $1 == "DIRECT" { xf[$2] = $3; xl[$2] = $4; xt[$2] = $5 }
  function expanded(p) {
    if (!c[p]) return 0
    if (p ~ /^docs\//) return 0
    if (d[p] == 1) return l[p] > kept * 0.02
    if (d[p] < 4) return l[p] > kept * TH
    return 0
  }
  function visible(p,   q, i) {
    q = p
    while ((i = match(q, /\/[^\/]*$/)) > 0) { q = substr(q, 1, i - 1); if (!expanded(q)) return 0 }
    return 1
  }
  END {
    if ("." in xf) printf "%s\t%d\t%d\t%d\t%s\n", "(ルート直下のファイル)", xf["."], xl["."], xt["."], ""
    for (i = 1; i <= n; i++) {
      p = order[i]; if (!visible(p)) continue
      if (expanded(p)) { if (p in xf) printf "%s\t%d\t%d\t%d\t%s\n", p "/ (直下のファイル)", xf[p], xl[p], xt[p], "" }
      else printf "%s\t%d\t%d\t%d\t%s\n", p "/", f[p], l[p], t[p], e[p]
    }
  }' | LC_ALL=C sort -t"$TAB" -k1,1 \
  | awk -F'\t' -v kept="$KEPT" '{ printf "| `%s` | %d | %d | %.1f%% | %d | %s |\n", $1, $2, $3, (kept ? $3 * 100 / kept : 0), $4, ($5 == "" ? "" : "`" $5 "`") }'

cat <<EOF

## 4. 大きいソースファイル（テストと文章を除く・1,000 行以上・上位 ${TOP}）

全体を一度に読まず、Grep で場所を絞ってから範囲を指定して読みます。

| 行数 | ファイル |
|---:|---|
EOF
BIGS="$(rec BIG | LC_ALL=C sort -t"$TAB" -k2,2nr -k3,3 | awk -v n="$TOP" 'NR <= n' | tick 3 | awk -F'\t' '{ printf "| %d | %s |\n", $2, $3 }')"
if [ -n "$BIGS" ]; then printf '%s\n' "$BIGS"; else echo "| — | 該当なし（1,000 行以上のコードのファイルは無い） |"; fi

cat <<EOF

## 5. 規約や全体の説明が書かれていそうな文書

コードを読む前に目を通します。書かれている規約がコードで守られているかは、別に確かめます。

| 行数 | 文書 |
|---:|---|
EOF
rec DOC | LC_ALL=C sort -t"$TAB" -k3,3 | awk 'NR <= 40' | tick 3 | awk -F'\t' '{ printf "| %d | %s |\n", $2, $3 }'

cat <<EOF

## 6. パッケージやビルドの境目を示すファイル（3階層まで）

区画の切れ目と、ビルド・起動・テストのコマンドを探す手がかりです。

EOF
rec MAN | LC_ALL=C sort -t"$TAB" -k2,2 | awk 'NR <= 60' | tick 2 | awk -F'\t' '{ printf "- %s\n", $2 }'

cat <<EOF

## 7. 中身が同じファイル（写し）

Git の内容の識別子（blob）が一致するファイルです（200 バイト未満は除く）。同じ中身なので、読むのは片方だけでよい。どちらが正本かは、それぞれの場所の役割で判断します。

| 数 | サイズ(KB) | ファイル |
|---:|---:|---|
EOF
DUPS="$(rec DUP | awk -F'\t' '{
  # 組の中は名前順に並べる（awk の実装で for-in の順序が変わるため）
  n = 0; for (i = 4; i <= NF; i++) a[++n] = $i
  for (i = 2; i <= n; i++) { v = a[i]; j = i - 1; while (j > 0 && a[j] > v) { a[j + 1] = a[j]; j-- } a[j + 1] = v }
  out = ""
  for (i = 1; i <= n; i++) { p = a[i]; if (index(p, "/") == 0) p = "./" p; out = out (out == "" ? "" : "・") "`" p "`" }
  printf "%d\t%d\t%s\n", $2, $3, out
}' | LC_ALL=C sort -t"$TAB" -k2,2nr -k3,3 | awk 'NR <= 30')"
if [ -n "$DUPS" ]; then
  printf '%s\n' "$DUPS" | awk -F'\t' '{ printf "| %d | %.1f | %s |\n", $1, $2 / 1024, $3 }'
else
  echo "| — | — | 該当なし |"
fi
