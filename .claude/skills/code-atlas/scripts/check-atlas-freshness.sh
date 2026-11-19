#!/usr/bin/env bash
# check-atlas-freshness.sh — 地図帳（docs/code-atlas/）の各ファイルが、今のコードからどれだけ古くなったかを調べる
#
# 目的: 古い地図を信じて作業する事故を防ぐ。地図帳を使う前と、更新する範囲を決めるときに実行する。
#
# 使い方（リポジトリ内で実行）:
#   bash <このスキル>/scripts/check-atlas-freshness.sh
#   bash <このスキル>/scripts/check-atlas-freshness.sh --dir docs/code-atlas
#
# 仕組み: 各ファイルの冒頭の「検証リビジョン」から HEAD までに変更されたファイルを数える。
#         冒頭に「対象パス」（バッククォートで囲んだパス。区画のページ）があれば、その範囲だけを数える。
#         無ければリポジトリ全体を数える。ただし docs/ の下は数えない（docs/rule/ だけは数える）。
#         どちらの場合も、地図帳自身（--dir）は数えない。
#         さらに流れの単位でも調べる: 図B（## 図B…）と区画の中の流れ（### 流れ: …）の見出しから次の見出しまでの
#         根拠のファイルが、検証リビジョンの後に変更されていれば「流れ: 要確認」と出す（順番を読み直す合図）。
# docs/ を外す理由: beam・power は機能ごとに docs/spec/・docs/tasks/ などの文書を足し、地図帳を作る
#         コミットにも同じ機能の文書が入る。これを数えると、作った直後から入口・全体像が「要確認」になる。
#         文書の区画のページは、対象パスに docs/ を書いているので、そちらで変化を拾う。
#         docs/rule/ は全体の規約（conventions.md）が読む開発ルールなので、全体の側でも数える。
# 依存: bash と git のみ。
# 終了コード: 0=すべて最新 / 1=古くなったファイルあり / 2=実行エラー

set -uo pipefail

DIR="docs/code-atlas"
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "ERROR: 不明な引数: $1" >&2; exit 2 ;;
  esac
done

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "ERROR: git リポジトリ内で実行してください。" >&2; exit 2; }
cd "$ROOT" || exit 2
[ -d "$DIR" ] || { echo "ERROR: 地図帳のフォルダがありません: $DIR" >&2; exit 2; }

HEAD_REV="$(git rev-parse HEAD)"
# 地図帳自身を数えないための除外。--dir がリポジトリの外（写しで試すときなど）なら付けない
# （外のパスを pathspec に渡すと git diff がエラーになり、変更が黙って 0 件に見えるため）。
case "$DIR" in
  /*) case "$DIR" in "$ROOT"/*) REL="${DIR#"$ROOT"/}" ;; *) REL="" ;; esac ;;
  *)  REL="$DIR" ;;
esac
EXCL=(); [ -n "$REL" ] && EXCL=(":(exclude)$REL")
TMPF="$(mktemp)" || exit 2
trap 'rm -f "$TMPF"' EXIT
echo "今のコミット: ${HEAD_REV:0:7}"
echo
printf '%-52s %-9s %s\n' "ファイル" "検証時点" "それ以降に変更されたファイル"

STALE=0
while IFS= read -r file; do
  [ -n "$file" ] || continue
  REV="$(grep -E '検証リビジョン' "$file" 2>/dev/null | grep -oE '[0-9a-f]{40}' | head -1)"
  if [ -z "$REV" ]; then
    printf '%-52s %-9s %s\n' "$file" "記載なし" "判定できません（冒頭に検証リビジョンを書いてください）"
    STALE=1; continue
  fi
  if ! git cat-file -e "${REV}^{commit}" 2>/dev/null; then
    printf '%-52s %-9s %s\n' "$file" "${REV:0:7}" "このコミットが手元にありません"
    STALE=1; continue
  fi
  if [ "$REV" = "$HEAD_REV" ]; then
    printf '%-52s %-9s %s\n' "$file" "${REV:0:7}" "0（最新）"
    continue
  fi

  # 「対象パス」の行から、バッククォートで囲まれたパスを取り出す。
  PATHS=()
  while IFS= read -r p; do
    [ -n "$p" ] && PATHS+=("${p#./}")
  done <<EOF
$(grep -E '対象パス' "$file" 2>/dev/null | head -1 | grep -oE '`[^`]+`' | tr -d '`')
EOF

  if [ "${#PATHS[@]}" -gt 0 ]; then
    N="$(git diff --name-only "$REV" "$HEAD_REV" -- "${PATHS[@]}" ${EXCL[@]+"${EXCL[@]}"} 2>/dev/null | grep -c '' )"
    SCOPE="対象パスの中"
  else
    N="$( { git diff --name-only "$REV" "$HEAD_REV" -- . ":(exclude)docs" ${EXCL[@]+"${EXCL[@]}"}
            git diff --name-only "$REV" "$HEAD_REV" -- docs/rule ${EXCL[@]+"${EXCL[@]}"}; } 2>/dev/null | sort -u | grep -c '' )"
    SCOPE="リポジトリ全体（docs/ は docs/rule/ だけ）"
  fi
  if [ "$N" -gt 0 ]; then
    printf '%-52s %-9s %s\n' "$file" "${REV:0:7}" "${N}（${SCOPE}。要確認）"
    STALE=1
  else
    printf '%-52s %-9s %s\n' "$file" "${REV:0:7}" "0（${SCOPE}。内容は最新）"
  fi

  # 流れの単位: 図B（## 図B…）と区画の中の流れ（### 流れ: …）の見出しから次の見出しまでの根拠のファイルが、
  # 検証リビジョンの後に変更されたか。検証は「場所が実在するか」しか見ないので、順番が古くなっても通ってしまう。
  FLOWS="$(awk '
    /^#/ { inflow = ($0 ~ /^##[ \t]+図B[0-9]*\./ || $0 ~ /^###[ \t]+流れ:/); if (inflow) { name = $0; sub(/^#+[ \t]+/, "", name); print "F\t" name }; next }
    inflow {
      s = $0
      while (match(s, /`[^`]+`/)) {
        tok = substr(s, RSTART + 1, RLENGTH - 2); s = substr(s, RSTART + RLENGTH)
        if (tok ~ /:\/\// || tok ~ /^\//) continue
        sub(/^\.\//, "", tok); sub(/:[0-9]+(-[0-9]+)?$/, "", tok)
        if (tok ~ /\// && tok ~ /\.[A-Za-z0-9]+$/) print "P\t" tok
      }
    }' "$file")"
  if [ -n "$FLOWS" ]; then
    git diff --name-only "$REV" "$HEAD_REV" > "$TMPF" 2>/dev/null
    printf '%s\n' "$FLOWS" | awk -F'\t' -v cf="$TMPF" '
      BEGIN { while ((getline l < cf) > 0) if (l != "") ch[l] = 1 }
      function flush() { if (fname == "") return
        if (hit != "") { printf "    └ 流れ「%s」: 要確認（根拠のファイルが変更された: %s）\n", fname, hit; stale = 1 }
        else printf "    └ 流れ「%s」: 根拠のファイルは変わっていない\n", fname }
      $1 == "F" { flush(); fname = $2; hit = ""; split("", seen); next }
      $1 == "P" && ($2 in ch) && !($2 in seen) { seen[$2] = 1; hit = (hit == "" ? $2 : hit "・" $2) }
      END { flush(); exit stale }' || STALE=1
  fi
done <<EOF
$(find "$DIR" -type f -name '*.md' | LC_ALL=C sort)
EOF

echo
if [ "$STALE" -eq 1 ]; then
  echo "古くなったファイルがあります。変更された範囲を読み直して更新し、検証リビジョンを書き換えてから根拠を再検証してください。"
  exit 1
fi
echo "すべて最新です。"
exit 0
