#!/usr/bin/env bash
# verify-atlas-evidence.sh — 地図帳（docs/code-atlas/）の根拠（`path:line`）が実コードに存在することを機械検証する
#
# 目的: 信頼性レベル 🔵 を「AI がそう申告した」から「機械が検証した」へ格上げする。
#       AI が書いたものを同じ AI が確認しても同じ盲点が入るため、機械的検査でしか担保できない。
#
# 使い方（リポジトリ内で実行）:
#   bash <このスキル>/scripts/verify-atlas-evidence.sh
#   bash <このスキル>/scripts/verify-atlas-evidence.sh --dir docs/code-atlas --rev <40桁SHA>
#   bash <このスキル>/scripts/verify-atlas-evidence.sh --file docs/code-atlas/sections/S03-api.md
#
# 検証対象の記法（これ以外は検証されない）:
#   `src/server/routes/tasks.ts:12`      単一行
#   `src/server/routes/tasks.ts:12-48`   行範囲
#   `./main.py:10`                       ルート直下（`/` を含めるため ./ を付ける）
#   ※ バッククォート内・`/` を含む・拡張子を持つ・`://` を含まない、が検出条件。
#     1 つのバッククォートには 1 つの根拠だけを書く（`a.ts:1, 5` や `:12` の省略形は検証されない）。
#
# 検証リビジョン: 各ファイルの冒頭の「検証リビジョン」（40桁）→ index.md のもの → --rev → HEAD の順で決める。
# 依存: bash と git のみ。
# 終了コード: 0=全件OK / 1=検証失敗あり（または根拠が 0 件）/ 2=実行エラー（前提未達）

set -uo pipefail

DIR="docs/code-atlas"
ONE=""
REV_OPT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dir)  DIR="${2:-}";     shift 2 ;;
    --file) ONE="${2:-}";     shift 2 ;;
    --rev)  REV_OPT="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "ERROR: 不明な引数: $1" >&2; exit 2 ;;
  esac
done

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "ERROR: git リポジトリ内で実行してください。" >&2; exit 2; }
cd "$ROOT" || exit 2

if [ -n "$ONE" ]; then
  [ -f "$ONE" ] || { echo "ERROR: ファイルがありません: $ONE" >&2; exit 2; }
  FILES="$ONE"
else
  [ -d "$DIR" ] || { echo "ERROR: 地図帳のフォルダがありません: $DIR（--dir で指定してください）" >&2; exit 2; }
  FILES="$(find "$DIR" -type f -name '*.md' | LC_ALL=C sort)"
  [ -n "$FILES" ] || { echo "ERROR: $DIR に .md がありません" >&2; exit 2; }
fi

rev_of() { grep -E '検証リビジョン' "$1" 2>/dev/null | grep -oE '[0-9a-f]{40}' | head -1; }

INDEX_REV=""
[ -f "$DIR/index.md" ] && INDEX_REV="$(rev_of "$DIR/index.md")"
HEAD_REV="$(git rev-parse HEAD 2>/dev/null)" || { echo "ERROR: HEAD を解決できません" >&2; exit 2; }

GT=0; GOK=0; GNG=0; GSUS=0
FAILED=""
# 同じファイルの行数を何度も数えないための覚え（直前の 1 件）。
LAST_KEY=""; LAST_COUNT=0

while IFS= read -r file; do
  [ -n "$file" ] || continue
  REV="$(rev_of "$file")"; SRC="自身"
  [ -z "$REV" ] && [ -n "$INDEX_REV" ] && { REV="$INDEX_REV"; SRC="index.md"; }
  [ -z "$REV" ] && [ -n "$REV_OPT" ] && { REV="$REV_OPT"; SRC="--rev"; }
  [ -z "$REV" ] && { REV="$HEAD_REV"; SRC="HEAD（記載なし）"; }
  if ! git cat-file -e "${REV}^{commit}" 2>/dev/null; then
    echo "ERROR: $file の検証リビジョン $REV がこのリポジトリに存在しません（fetch するか SHA を直してください）" >&2
    exit 2
  fi

  REFS="$(grep -oE '`[^`]+`' "$file" 2>/dev/null \
    | tr -d '`' \
    | grep -E '/' \
    | grep -vE '://' \
    | grep -vE '^/' \
    | grep -E '^[[:alnum:]_./@+-]+\.[[:alnum:]]+(:[0-9]+(-[0-9]+)?)?$' \
    | LC_ALL=C sort -u || true)"

  # 検証されない書き方の疑い: `:12` の省略形、`a.ts:1, 5` のような複数指定、行番号の後ろに余計な文字、
  # `/` で始まるもの（URL のパスか絶対パス。どちらも根拠にならない）。
  SUS="$(grep -oE '`[^`]+`' "$file" 2>/dev/null | tr -d '`' \
    | grep -vE '://' \
    | grep -E '^:[0-9]|\.[[:alnum:]]+:[0-9]+(-[0-9]+)?[ ,、・]|^/[[:alnum:]_./@+-]+\.[[:alnum:]]+(:[0-9]+(-[0-9]+)?)?$' || true)"
  NSUS=0
  [ -n "$SUS" ] && NSUS="$(printf '%s\n' "$SUS" | grep -c '' )"

  T=0; OK=0; NG=0
  if [ -n "$REFS" ]; then
    while IFS= read -r ref; do
      [ -n "$ref" ] || continue
      T=$((T+1))
      case "$ref" in
        *:*) p="${ref%:*}"; lines="${ref##*:}" ;;
        *)   p="$ref";      lines="" ;;
      esac
      p="${p#./}"

      fail() { NG=$((NG+1)); FAILED="${FAILED}  ❌ ${file}: ${ref}\n       理由: $1\n       対処: $2\n"; }

      case "$p" in
        /*)     fail "絶対パスです" "リポジトリルート相対のパスにしてください"; continue ;;
        *..*)   fail "親ディレクトリ参照（..）を含みます" "リポジトリ内のパスにしてください"; continue ;;
        .git/*) fail ".git 配下を指しています" "実コードのパスを指してください"; continue ;;
      esac

      otype="$(git cat-file -t "${REV}:${p}" 2>/dev/null || true)"
      if [ "$otype" != "blob" ]; then
        # 原因を分けて伝える（追跡外・未コミット・途中からのパス・本当に無い）
        if [ -e "$p" ] && git ls-files --error-unmatch -- "$p" >/dev/null 2>&1; then
          fail "検証リビジョン ${REV:0:7} の後に足されたファイルです（まだコミットしていないか、新しいコミットで入った）" \
               "根拠にするならコミットしてから検証リビジョンを更新する。同じコミットで入る文書（地図帳のページなど）を指すなら、バッククォートを外してリンクにする"
        elif [ -e "$p" ]; then
          fail "Git で追跡していないファイルです（作業ツリーにだけある。例: .env.local・node_modules の中・data/ の DB）" \
               "追跡外のファイルは根拠にできない。バッククォートを外して地の文で書く"
        else
          cand="$(git ls-tree -r --name-only "$REV" 2>/dev/null | awk -v t="/$p" 'length($0) > length(t) && substr($0, length($0) - length(t) + 1) == t' | head -3 | tr '\n' ' ')"
          if [ -n "$cand" ]; then
            fail "途中からのパスです（リポジトリのルートからの完全なパスではない）" "候補: ${cand}"
          else
            fail "リビジョン ${REV:0:7} 時点でファイルが存在しません" "実在するパスに直すか、検証リビジョンを更新してください"
          fi
        fi
        continue
      fi

      if [ -n "$lines" ]; then
        last="${lines##*-}"
        key="${REV}:${p}"
        if [ "$key" != "$LAST_KEY" ]; then
          # 行数は awk の NR で数える（wc -l は末尾に改行が無いファイルの最終行を取りこぼす）。
          LAST_COUNT="$(git show "$key" 2>/dev/null | awk 'END{print NR+0}')"
          LAST_KEY="$key"
        fi
        if [ -n "$last" ] && [ "$last" -gt "$LAST_COUNT" ] 2>/dev/null; then
          fail "${last} 行目を参照していますが、そのリビジョンでは ${LAST_COUNT} 行しかありません" "実在する行範囲に直してください"
          continue
        fi
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
  fi

  printf '%-52s 根拠 %4d 件 / OK %4d / 失敗 %3d / 検証されない書き方の疑い %3d  [%s・%s]\n' \
    "$file" "$T" "$OK" "$NG" "$NSUS" "${REV:0:7}" "$SRC"
  if [ "$NSUS" -gt 0 ]; then
    printf '%s\n' "$SUS" | head -5 | sed 's/^/      ⚠️  /'
  fi
  GT=$((GT+T)); GOK=$((GOK+OK)); GNG=$((GNG+NG)); GSUS=$((GSUS+NSUS))
done <<EOF
$FILES
EOF

echo
echo "検証した根拠: ${GT} 件 / OK ${GOK} / 失敗 ${GNG} / 検証されない書き方の疑い ${GSUS}"
if [ "$GSUS" -gt 0 ]; then
  echo "⚠️  疑いのある箇所は検証されていません。1 つのバッククォートに 1 つの \`パス:行\` を書く形に直してください。"
  echo "    / で始まるもの（URL のパスや絶対パス）は根拠にならないので、バッククォートを外すか、リポジトリのルートからのパスにしてください。"
fi
if [ "$GT" -eq 0 ]; then
  echo "検証対象の根拠が 1 件も見つかりませんでした（記法が外れている可能性があります）。"
  exit 1
fi
if [ "$GNG" -gt 0 ]; then
  echo
  echo "--- 失敗した根拠 ---"
  printf "%b" "$FAILED"
  echo "失敗した根拠を含む項目は 🔵 を名乗れません。パスを直すか 🟡 へ格下げしてください。"
  exit 1
fi
echo "すべての根拠が実コードに存在します（この範囲は 🔵 を機械的に裏打ちできます）。"
exit 0
