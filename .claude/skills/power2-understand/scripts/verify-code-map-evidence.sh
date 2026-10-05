#!/usr/bin/env bash
# verify-code-map-evidence.sh — code-map.md の根拠（`path:line`）が実コードに存在することを機械検証する
#
# 目的: 信頼性レベル 🔵 を「AI がそう申告した」から「機械が検証した」へ格上げする。
#       AI が書いたものを同じ AI が確認しても同じ盲点が入るため、機械的検査でしか担保できない。
#
# 使い方（リポジトリ内で実行）:
#   bash .claude/skills/power2-understand/scripts/verify-code-map-evidence.sh
#   bash .../verify-code-map-evidence.sh --file docs/code-map.md --rev <40桁SHA>
#
# 検証対象の記法（これ以外は検証されない）:
#   `src/server/routes/tasks.ts:12`      単一行
#   `src/server/routes/tasks.ts:12-48`   行範囲
#   `./main.py:10`                       ルート直下（`/` を含めるため ./ を付ける）
#   ※ バッククォート内・`/` を含む・拡張子を持つ・`://` を含まない、が検出条件。
#     ホスト:ポート（127.0.0.1:8080）を誤検出しないための規則。
#
# 終了コード: 0=全件OK / 1=検証失敗あり / 2=実行エラー（前提未達）

set -uo pipefail

FILE=""
REV=""
while [ $# -gt 0 ]; do
  case "$1" in
    --file) FILE="${2:-}"; shift 2 ;;
    --rev)  REV="${2:-}";  shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "ERROR: 不明な引数: $1" >&2; exit 2 ;;
  esac
done

# --- 前提: git リポジトリ内であること ---
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "ERROR: git リポジトリ内で実行してください。" >&2; exit 2; }
cd "$ROOT" || exit 2

# --- 対象ファイルの決定 ---
if [ -z "$FILE" ]; then
  for cand in docs/code-map.md code-map.md; do
    [ -f "$cand" ] && { FILE="$cand"; break; }
  done
fi
[ -n "$FILE" ] && [ -f "$FILE" ] || {
  echo "ERROR: code-map が見つかりません（--file で指定してください）" >&2; exit 2; }

# --- 検証リビジョンの決定（ファイル記載 → --rev → HEAD の順で上書き） ---
if [ -z "$REV" ]; then
  REV="$(grep -E '検証リビジョン' "$FILE" 2>/dev/null | grep -oE '[0-9a-f]{40}' | head -1)"
fi
if [ -z "$REV" ]; then
  echo "WARN: $FILE に「検証リビジョン」の記載がありません。HEAD に対して検証します。" >&2
  echo "      本来は code-map 冒頭に次の行を置いてください:" >&2
  echo "      > **検証リビジョン**: \`\$(git rev-parse HEAD)\`" >&2
  REV="$(git rev-parse HEAD 2>/dev/null)" || { echo "ERROR: HEAD を解決できません" >&2; exit 2; }
fi
git cat-file -e "${REV}^{commit}" 2>/dev/null || {
  echo "ERROR: リビジョン $REV がこのリポジトリに存在しません（fetch するか SHA を直してください）" >&2; exit 2; }

echo "対象ファイル : $FILE"
echo "リビジョン   : ${REV:0:7} ($REV)"
echo

# --- 根拠の抽出 ---
REFS="$(grep -oE '`[^`]+`' "$FILE" 2>/dev/null \
  | tr -d '`' \
  | grep -E '/' \
  | grep -vE '://' \
  | grep -E '^[[:alnum:]_./@+-]+\.[[:alnum:]]+(:[0-9]+(-[0-9]+)?)?$' \
  | sort -u || true)"

if [ -z "$REFS" ]; then
  echo "検証対象の根拠が1件も見つかりませんでした。"
  echo "  図のノードに対応する根拠表（\`path:line\` 形式）を書いてください。"
  echo "  ルート直下のファイルは ./main.py:10 のように ./ を付ける必要があります。"
  exit 1
fi

TOTAL=0; OK=0; NG=0
FAILED=""

while IFS= read -r ref; do
  [ -n "$ref" ] || continue
  TOTAL=$((TOTAL+1))

  # path と行の分解
  case "$ref" in
    *:*) p="${ref%:*}"; lines="${ref##*:}" ;;
    *)   p="$ref";      lines="" ;;
  esac
  p="${p#./}"   # 先頭の ./ を除去（リポジトリ相対に正規化）

  fail() { NG=$((NG+1)); FAILED="${FAILED}  ❌ ${ref}\n       理由: $1\n       対処: $2\n"; }

  # 1) パス安全性
  case "$p" in
    /*)        fail "絶対パスです" "リポジトリルート相対のパスにしてください"; continue ;;
    *..*)      fail "親ディレクトリ参照（..）を含みます" "リポジトリ内のパスにしてください"; continue ;;
    .git/*)    fail ".git 配下を指しています" "実コードのパスを指してください"; continue ;;
  esac

  # 2) そのリビジョンにファイルが存在するか
  otype="$(git cat-file -t "${REV}:${p}" 2>/dev/null || true)"
  if [ "$otype" != "blob" ]; then
    fail "リビジョン ${REV:0:7} 時点でファイルが存在しません" "実在するパスに直すか、検証リビジョンを更新してください"
    continue
  fi

  # 3) 行が存在するか（行指定がある場合）
  if [ -n "$lines" ]; then
    last="${lines##*-}"
    # 行数は awk の NR で数える。wc -l は「改行の数」なので、
    # 末尾に改行が無いファイル（よくある）の最終行を取りこぼす。
    count="$(git show "${REV}:${p}" 2>/dev/null | awk 'END{print NR+0}')"
    if [ -n "$last" ] && [ "$last" -gt "$count" ] 2>/dev/null; then
      fail "${last} 行目を参照していますが、そのリビジョンでは ${count} 行しかありません" "実在する行範囲に直してください"
      continue
    fi
    # 範囲の向きチェック
    case "$lines" in
      *-*) first="${lines%%-*}"
           if [ "$first" -gt "$last" ] 2>/dev/null; then
             fail "行範囲の開始(${first})が終了(${last})より大きいです" "開始 ≦ 終了 にしてください"; continue
           fi ;;
    esac
  fi

  OK=$((OK+1))
done <<EOF
$REFS
EOF

echo "検証した根拠: ${TOTAL} 件 / OK ${OK} / 失敗 ${NG}"
if [ "$NG" -gt 0 ]; then
  echo
  echo "--- 失敗した根拠 ---"
  printf "%b" "$FAILED"
  echo "失敗した根拠を含む項目は 🔵 を名乗れません。パスを直すか 🟡 へ格下げしてください。"
  exit 1
fi
echo "すべての根拠が実コードに存在します（この範囲は 🔵 を機械的に裏打ちできます）。"
exit 0
