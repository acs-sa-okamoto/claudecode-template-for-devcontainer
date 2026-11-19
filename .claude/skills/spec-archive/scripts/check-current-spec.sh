#!/usr/bin/env bash
# check-current-spec.sh — 現役の仕様（docs/spec/current/）へのまとめ込みで、要件を落としていないかを確かめる
#
# 対象の「まとめる元」で定義された ID が、次のどちらかにあるかを調べる:
#   - docs/spec/current/ の .md に「ID（名前）」の形で書かれている（例: FR-11（app-guide-onboarding））
#   - docs/spec/ARCHIVE.md に「ID（名前）」の形で書かれている（まとめなかった ID。理由を添える）
# 廃止マーク（~~ID~~）で定義された ID は、自動で「まとめなかった」扱いにする（一覧に出すだけ）。
# あわせて、current/ の見出しの ID の重複と、まとめた・まとめなかったの両方にある ID を調べる。
#
# 使い方（リポジトリ内で実行）:
#   bash <このスキル>/scripts/check-current-spec.sh --target sound-feedback --target my-app
#   bash <このスキル>/scripts/check-current-spec.sh --target sound-feedback --rev <コミット>   片付けた後に、履歴の元と照らす
#
# 「定義」とみなす書き方（行頭）: 見出し（### FR-01）・箇条書き（- **FR-01**）・表の 1 列目（| FR-01 |）・太字（**AC-05**:）
# 数える ID の種類:
#   power（feature-requirements.md）: FR NFR AC EDGE CON   ※ REQ は beam の ID を引いているだけなので数えない
#   beam（requirements.md・acceptance-criteria.md）: REQ NFR AC EDGE CON   ※ FR は PRD の ID を引いているだけなので数えない
#
# 依存: bash・git・awk
# 終了コード: 0=抜けなし / 1=抜けか重複あり / 2=実行エラー

set -uo pipefail

TARGETS=(); REV=""
while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGETS+=("${2:-}"); shift 2 ;;
    --rev)    REV="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "ERROR: 不明な引数: $1" >&2; exit 2 ;;
  esac
done
[ ${#TARGETS[@]} -gt 0 ] || { echo "ERROR: --target <名前> を 1 つ以上指定してください" >&2; exit 2; }

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "ERROR: git リポジトリ内で実行してください。" >&2; exit 2; }
cd "$ROOT" || exit 2
CUR="docs/spec/current"
ARC="docs/spec/ARCHIVE.md"
[ -d "$CUR" ] || { echo "ERROR: $CUR がありません（現役の仕様をまだ作っていません）" >&2; exit 2; }
if [ -n "$REV" ]; then git cat-file -e "${REV}^{commit}" 2>/dev/null || { echo "ERROR: コミットがありません: $REV" >&2; exit 2; }; fi

IDRE='(REQ|FR|NFR|AC|EDGE|CON)-[0-9]+（[A-Za-z0-9._-]+）'
TMP="$(mktemp -d)" || exit 2
trap 'rm -rf "$TMP"' EXIT

find "$CUR" -type f -name '*.md' -print0 | xargs -0 grep -ohE "$IDRE" 2>/dev/null | sort -u > "$TMP/cur"
if [ -f "$ARC" ]; then grep -ohE "$IDRE" "$ARC" | sort -u > "$TMP/arc"; else : > "$TMP/arc"; fi

src() {  # $1=パス。--rev があれば履歴から、無ければ作業ツリーから読む
  if [ -n "$REV" ]; then git show "${REV}:$1" 2>/dev/null; else cat "$1" 2>/dev/null; fi
}
exists() {
  if [ -n "$REV" ]; then git cat-file -e "${REV}:$1" 2>/dev/null; else [ -f "$1" ]; fi
}
defined_ids() {  # 標準入力の文書から「ID<TAB>廃止(0/1)」を出す。$1=数える種類（| 区切り）
  awk -v kinds="$1" '
    BEGIN { re = "^[ \t]*(#+[ \t]+|[-*][ \t]+|\\|[ \t]*)?(~~)?(\\*\\*)?(~~)?(" kinds ")-[0-9]+" }
    {
      if (match($0, re)) {
        s = substr($0, RSTART, RLENGTH); d = (index(s, "~~") > 0) ? 1 : 0
        if (match(s, "(" kinds ")-[0-9]+$")) print substr(s, RSTART, RLENGTH) "\t" d
      }
    }'
}

NG=0
echo "# 現役の仕様の網羅チェック（$( [ -n "$REV" ] && echo "元: ${REV:0:7}" || echo "元: 作業ツリー" )）"
echo
echo "| 名前 | 定義 | まとめた | まとめなかった | 廃止マーク | 抜け |"
echo "|---|---|---|---|---|---|"
: > "$TMP/missing"; : > "$TMP/both"; : > "$TMP/obsolete"
for T in "${TARGETS[@]}"; do
  case "$T" in ''|*[!A-Za-z0-9._-]*) echo "⚠️  名前に使えない文字があるので飛ばします: $T" >&2; continue ;; esac
  : > "$TMP/def"
  if exists "docs/spec/$T/feature-requirements.md"; then
    src "docs/spec/$T/feature-requirements.md" | defined_ids 'FR|NFR|AC|EDGE|CON' >> "$TMP/def"
  fi
  for f in requirements.md acceptance-criteria.md; do
    exists "docs/spec/$T/$f" && src "docs/spec/$T/$f" | defined_ids 'REQ|NFR|AC|EDGE|CON' >> "$TMP/def"
  done
  if [ ! -s "$TMP/def" ]; then
    printf '| %s | （まとめる元が見つからない） | | | | |\n' "$T"; continue
  fi
  # ID ごとに: 1 回でも廃止マークなしで定義されていれば現役、すべて廃止マークなら廃止
  awk -F'\t' '{ if (!($1 in st)) st[$1] = $2; else if ($2 == 0) st[$1] = 0 } END { for (k in st) print k "\t" st[k] }' "$TMP/def" | sort > "$TMP/ids"
  awk -F'\t' -v t="$T" -v cf="$TMP/cur" -v af="$TMP/arc" -v mf="$TMP/missing" -v bf="$TMP/both" -v of="$TMP/obsolete" '
    BEGIN { while ((getline l < cf) > 0) cur[l] = 1; while ((getline l < af) > 0) arc[l] = 1 }
    {
      key = $1 "（" t "）"; n++
      if ($2 == 1 && !(key in cur)) { ob++; print key >> of; next }
      if ((key in cur) && (key in arc)) print key >> bf
      if (key in cur) c++
      else if (key in arc) a++
      else { m++; print key >> mf }
    }
    END { printf "| %s | %d | %d | %d | %d | %s |\n", t, n, c, a, ob, (m > 0 ? "**" m "**" : "0") }' "$TMP/ids"
done
echo

if [ -s "$TMP/missing" ]; then
  NG=1
  echo "## 抜け（現役の仕様にも、まとめなかった ID にも無い）"
  echo
  sed 's/^/- /' "$TMP/missing"
  echo
  echo "→ 現役の仕様に「ID（名前）」の形で書くか、ARCHIVE.md の「まとめなかった ID」に理由を添えて書く。"
  echo
fi
if [ -s "$TMP/both" ]; then
  NG=1
  echo "## まとめた ID と、まとめなかった ID の両方にあるもの"
  echo
  sed 's/^/- /' "$TMP/both"
  echo
fi
DUP="$(find "$CUR" -type f -name '*.md' -print0 | xargs -0 grep -hE '^#+ ' 2>/dev/null | grep -oE "$IDRE" | sort | uniq -d)"
if [ -n "$DUP" ]; then
  NG=1
  echo "## 見出しの ID の重複（同じ要件が 2 か所に書かれている）"
  echo
  printf '%s\n' "$DUP" | sed 's/^/- /'
  echo
fi
if [ -s "$TMP/obsolete" ]; then
  echo "## 廃止マークの ID（自動で「まとめなかった」扱い。ARCHIVE.md に書かなくてよい）"
  echo
  tr '\n' ' ' < "$TMP/obsolete"; echo
  echo
fi

if [ "$NG" -eq 0 ]; then echo "抜け・重複はありません。"; else echo "抜けか重複があります（上の一覧）。"; fi
exit "$NG"
