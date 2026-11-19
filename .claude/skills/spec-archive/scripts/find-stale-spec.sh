#!/usr/bin/env bash
# find-stale-spec.sh — 仕様の文書のうち、今は無いコードを書いている節を見つける（古くなった記述の手がかり）
#
# 見出し（#〜####）で区切った節ごとに、バッククォートで書いたリポジトリ内のパスを取り出し、
# 今の HEAD に無いものを出す。後の改修で消えた部品（コンポーネント・画面・テスト）を書いている節は、
# 仕様の変更で古くなった可能性が高い。
#
# 使い方（リポジトリ内で実行）:
#   bash <このスキル>/scripts/find-stale-spec.sh                       既定: docs/spec/current
#   bash <このスキル>/scripts/find-stale-spec.sh docs/spec/sound-feedback docs/spec/current/wordbook.md
#
# 数えないもの:
#   - docs/ の下のパス（文書どうしの参照は spec-inventory.sh の参照の確認で見る）
#   - 先頭がリポジトリの最上位に無いパス（`design/x.md` のような、文書から見た相対パス）
#   - 書式の見本（* { } < > を含むもの、page-N のような N の置き場所）・URL
#   - Git で無視している生成物（.gitignore に当たるもの）
# 「無い」ことは古さの手がかりで、確定ではない（名前を変えただけのこともある）。直すかどうかは人が決める。
#
# 依存: bash・git・awk
# 終了コード: 0=見つからない / 1=見つかった / 2=実行エラー

set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "ERROR: git リポジトリ内で実行してください。" >&2; exit 2; }
cd "$ROOT" || exit 2
[ $# -gt 0 ] || set -- docs/spec/current
for a in "$@"; do [ -e "$a" ] || { echo "ERROR: ありません: $a" >&2; exit 2; }; done

TMP="$(mktemp -d)" || exit 2
trap 'rm -rf "$TMP"' EXIT

# ファイル<TAB>行<TAB>見出し<TAB>パス
find "$@" -type f -name '*.md' | LC_ALL=C sort | while IFS= read -r f; do
  awk -v f="$f" '
    /^#+[ \t]/ { h = $0; hl = NR; next }
    {
      s = $0
      while (match(s, /`[^`]+`/)) {
        tok = substr(s, RSTART + 1, RLENGTH - 2); s = substr(s, RSTART + RLENGTH)
        if (tok ~ /:\/\//) continue
        sub(/^\.\//, "", tok); sub(/:[0-9]+(-[0-9]+)?$/, "", tok)
        if (tok !~ /\//) continue
        if (tok !~ /^[A-Za-z0-9_.@+()\[\]\/-]+\.[A-Za-z0-9]+$/) continue
        if (tok ~ /^docs\// || tok ~ /^\//) continue
        if (tok ~ /[*{}<>]/ || tok ~ /-N\./) continue
        printf "%s\t%d\t%s\t%s\n", f, (hl ? hl : 1), (h != "" ? h : "（冒頭）"), tok
      }
    }' "$f"
done > "$TMP/refs"

# 先頭がリポジトリの最上位にある名前のパスだけを見る（`design/x.md` のような、文書から見た相対パスを外すため）
git ls-tree --name-only HEAD > "$TMP/top"
: > "$TMP/gone"
while IFS="$(printf '\t')" read -r f l h p; do
  [ -n "$p" ] || continue
  grep -qxF -- "${p%%/*}" "$TMP/top" || continue
  git check-ignore -q "$p" 2>/dev/null && continue
  git cat-file -e "HEAD:$p" 2>/dev/null && continue
  printf '%s\t%s\t%s\t%s\n' "$f" "$l" "$h" "$p" >> "$TMP/gone"
done < <(sort -u "$TMP/refs")

if [ ! -s "$TMP/gone" ]; then
  echo "今は無いコードを書いている節は見つかりませんでした（対象: $*）。"
  exit 0
fi

echo "# 今は無いコードを書いている節（HEAD $(git rev-parse --short HEAD)）"
echo
echo "| 文書:見出しの行 | 見出し | 今は無いパス |"
echo "|---|---|---|"
sort -t"$(printf '\t')" -k1,1 -k2,2n "$TMP/gone" | awk -F'\t' '
  { k = $1 ":" $2; if (k != pk) { if (pk != "") printf "| `%s` | %s | %s |\n", pk, ph, ps; pk = k; ph = $3; ps = "`" $4 "`" } else ps = ps " `" $4 "`" }
  END { if (pk != "") printf "| `%s` | %s | %s |\n", pk, ph, ps }'
echo
echo "- 消えた理由は \`git log --diff-filter=D --oneline -- <パス>\` で分かる（どの改修で消えたか）。"
echo "- 名前を変えただけなら、新しいパスに直す。機能ごと無くなったなら、仕様の記述を今の動きに合わせる（要件の変更なら /revise）。"
exit 1
