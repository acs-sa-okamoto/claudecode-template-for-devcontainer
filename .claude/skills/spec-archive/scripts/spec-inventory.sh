#!/usr/bin/env bash
# spec-inventory.sh — 仕様の片付け（spec-archive）の目録を作る
#
# 機能（power の機能名・beam の要件名）ごとに、
#   1. 完了しているか（トランクに入った・作業中のブランチが無い・tasks.db に残りのタスクが無い）
#   2. 文書の区分（まとめる元・運用を移す・作業用・記録）
#   3. 片付ける候補のうち、コード・テスト・現役の文書から参照されているもの
# を一覧にする。読み取りだけで、何も変更しない。
#
# 使い方（リポジトリ内で実行）:
#   bash <このスキル>/scripts/spec-inventory.sh --all
#   bash <このスキル>/scripts/spec-inventory.sh --target sound-feedback --target public-launch
#   オプション:
#     --list <ファイル>  片付けの一覧（名前<TAB>判定<TAB>区分<TAB>パス）を書き出す
#     --brief            「完了していて、まだ片付けていない」名前だけを 1 行ずつ出す（参照の確認はしない）
#
# 依存: bash・git（sqlite3 と data/tasks.db があれば、残りのタスクも見る）
# 終了コード: 0=正常 / 2=実行エラー

set -uo pipefail

ALL=0; BRIEF=0; LIST=""; TARGETS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --all)    ALL=1; shift ;;
    --brief)  BRIEF=1; ALL=1; shift ;;
    --target) TARGETS+=("${2:-}"); shift 2 ;;
    --list)   LIST="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "ERROR: 不明な引数: $1" >&2; exit 2 ;;
  esac
done
[ "$ALL" -eq 1 ] || [ ${#TARGETS[@]} -gt 0 ] || { echo "ERROR: --all か --target <名前> を指定してください" >&2; exit 2; }

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "ERROR: git リポジトリ内で実行してください。" >&2; exit 2; }
cd "$ROOT" || exit 2

# トランク（origin の既定ブランチ → origin/main → origin/master → main → master）
TRUNK=""
for c in "$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null)" origin/main origin/master main master; do
  [ -n "$c" ] || continue
  if git rev-parse -q --verify "${c}^{commit}" >/dev/null 2>&1; then TRUNK="$c"; break; fi
done
[ -n "$TRUNK" ] || TRUNK="HEAD"
CUR_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"

# 対象の名前（docs/spec・docs/tasks・docs/implements の直下のフォルダ。current は現役の仕様なので除く）
if [ "$ALL" -eq 1 ]; then
  while IFS= read -r n; do TARGETS+=("$n"); done < <(
    git ls-files docs/spec docs/tasks docs/implements | awk -F/ 'NF>=4 && $3 != "current" {print $3}' | sort -u)
fi

TMP="$(mktemp -d)" || exit 2
trap 'rm -rf "$TMP"' EXIT
: > "$TMP/files"      # 名前<TAB>判定<TAB>区分<TAB>パス
: > "$TMP/verdict"    # 名前<TAB>種類<TAB>判定<TAB>根拠

valid_name() { case "$1" in ''|*[!A-Za-z0-9._-]*) return 1 ;; *) return 0 ;; esac; }

classify() {  # $1=名前 $2=パス
  local t="$1" p="$2"
  case "$p" in
    "docs/spec/$t/feature-requirements.md"|"docs/spec/$t/requirements.md"|"docs/spec/$t/acceptance-criteria.md"|"docs/spec/$t/product-requirements.md")
      echo "まとめる元" ;;
    "docs/spec/$t/prep.md") echo "運用を移す" ;;
    "docs/tasks/$t/conformance-report.md"|"docs/tasks/$t/regression-report.md"|"docs/tasks/$t/ui-polish-report.md"|docs/reviews/*)
      echo "記録" ;;
    *) echo "作業用" ;;
  esac
}

REVIEWS="$(git ls-files 'docs/reviews/*.md')"
ALLREFS="$(git for-each-ref --format='%(refname:short)' refs/heads refs/remotes 2>/dev/null)"
# トランクのマージコミットの件名（行末がブランチ名のもの。例: Merge pull request #93 from owner/power6-xxx）
MERGES="$(git log --merges --format='%s' "$TRUNK" 2>/dev/null | sed -n 's/^Merge .* from \([^ ]*\)$/\1/p')"
merged_by_commit() {  # $1=ブランチ名（origin/ なし）。「…/<ブランチ名>」で終わるマージ元があれば 0
  printf '%s\n' "$MERGES" | awk -v s="/$1" '{ if (length($0) >= length(s) && substr($0, length($0) - length(s) + 1) == s) f = 1 } END { exit !f }'
}

for T in "${TARGETS[@]}"; do
  valid_name "$T" || { echo "⚠️  名前に使えない文字があるので飛ばします: $T" >&2; continue; }

  KIND="不明"
  git ls-files --error-unmatch "docs/spec/$T/requirements.md" >/dev/null 2>&1 && KIND="beam"
  git ls-files --error-unmatch "docs/spec/$T/feature-requirements.md" >/dev/null 2>&1 && KIND="power"

  # 根拠を集める
  WHY=""; VERD="完了"
  INTRUNK=0
  for d in "docs/spec/$T" "docs/tasks/$T" "docs/implements/$T"; do
    git cat-file -e "${TRUNK}:${d}" 2>/dev/null && { INTRUNK=1; break; }
  done
  [ "$INTRUNK" -eq 1 ] || { VERD="作業中"; WHY="${WHY}トランク（${TRUNK}）に入っていない。"; }

  # マージ済みの判定は 3 通りで見る。スタックド PR はマージ前に積み直す（rebase）ので、
  # 手元のブランチの先端がトランクの祖先にならないことが多い（祖先かどうかだけでは誤って「作業中」になる）。
  #   ① トランクの祖先 ② トランクに「from <owner>/<ブランチ名>」のマージコミットがある ③ パッチがすべてトランクにある（git cherry）
  OPEN=""
  while IFS= read -r r; do
    [ -n "$r" ] || continue
    case "$r" in "$T"|*/"$T"|*-"$T") ;; *) continue ;; esac
    case "$r" in */HEAD) continue ;; esac
    git merge-base --is-ancestor "$r" "$TRUNK" 2>/dev/null && continue
    short="${r#origin/}"
    merged_by_commit "$short" && continue
    [ "$(git cherry "$TRUNK" "$r" 2>/dev/null | grep -c '^+')" = "0" ] && continue
    OPEN="${OPEN}${r} "
  done <<< "$ALLREFS"
  [ -n "$OPEN" ] && { VERD="作業中"; WHY="${WHY}マージしていないブランチ: ${OPEN% }。"; }
  case "$CUR_BRANCH" in "$T"|*/"$T"|*-"$T") VERD="作業中"; WHY="${WHY}いまのブランチ（${CUR_BRANCH}）が、この機能のもの。" ;; esac

  TASKS="（tasks.db なし）"
  if command -v sqlite3 >/dev/null 2>&1 && [ -f data/tasks.db ]; then
    has="$(sqlite3 data/tasks.db "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='$T';" 2>/dev/null || echo 0)"
    if [ "${has:-0}" -gt 0 ] 2>/dev/null; then
      rest="$(sqlite3 data/tasks.db "SELECT count(*) FROM \"$T\" WHERE COALESCE(is_deleted,0)=0 AND status<>'done';" 2>/dev/null || echo '?')"
      TASKS="残り ${rest}"
      if [ "$rest" != "0" ]; then VERD="作業中"; WHY="${WHY}tasks.db に done でないタスクが ${rest} 件。"; fi
    else
      TASKS="（テーブルなし）"
    fi
  fi
  [ -n "$WHY" ] || WHY="トランクに入っていて、作業中のブランチも残りのタスクも無い。"
  printf '%s\t%s\t%s\t%s\t%s\n' "$T" "$KIND" "$VERD" "$TASKS" "$WHY" >> "$TMP/verdict"

  # ファイル（機能のフォルダ＋名前にこの機能名を含むレビュー）
  {
    git ls-files "docs/spec/$T" "docs/tasks/$T" "docs/implements/$T"
    printf '%s\n' "$REVIEWS" | awk -v t="$T" 'NF { b=$0; sub(/^.*\//, "", b); sub(/\.md$/, "", b); if (index("-" b "-", "-" t "-") > 0) print }'
  } | sort -u | while IFS= read -r p; do
    [ -n "$p" ] || continue
    printf '%s\t%s\t%s\t%s\n' "$T" "$VERD" "$(classify "$T" "$p")" "$p"
  done >> "$TMP/files"
done

# 持ち主の分からないレビュー（--all のときだけ）
if [ "$ALL" -eq 1 ] && [ -n "$REVIEWS" ]; then
  cut -f4 "$TMP/files" | sort -u > "$TMP/owned"
  printf '%s\n' "$REVIEWS" | while IFS= read -r p; do
    [ -n "$p" ] || continue
    grep -qxF -- "$p" "$TMP/owned" || printf '%s\t%s\t%s\t%s\n' "(持ち主不明)" "要確認" "記録" "$p"
  done >> "$TMP/files"
fi

if [ "$BRIEF" -eq 1 ]; then
  awk -F'\t' '$3 == "完了" {print $1}' "$TMP/verdict"
  exit 0
fi

# ── 参照の確認（片付ける候補を、候補以外のファイルが参照していないか） ──
awk -F'\t' '$2 != "作業中" {print $4}' "$TMP/files" | sort -u > "$TMP/cands"   # 作業中の機能のファイルは候補にしない
: > "$TMP/hits"
if [ -s "$TMP/cands" ]; then
  git grep -n -F -f "$TMP/cands" -- . ':(exclude).claude/skills' ':(exclude).claude/skills-catalog' ':(exclude)docs/spec/ARCHIVE.md' 2>/dev/null \
    | awk -v cf="$TMP/cands" '
        BEGIN { while ((getline l < cf) > 0) { cand[l] = 1; pat[++n] = l } }
        {
          f = $0; i = index(f, ":"); file = substr(f, 1, i - 1); rest = substr(f, i + 1)
          j = index(rest, ":"); line = substr(rest, 1, j - 1); body = substr(rest, j + 1)
          if (file in cand) next
          kind = "コード・テスト・設定"
          if (file ~ /^docs\/code-atlas\//) kind = "地図帳"
          else if (file ~ /^docs\/revisions\//) kind = "改定記録（直さない）"
          else if (file ~ /(^|\/)migrations?\// || file ~ /(^|\/)db\/migrate\//) kind = "マイグレーション（直さない）"
          else if (file ~ /^docs\/(spec|tasks|implements|reviews)\//) kind = "片付けない機能の文書"
          else if (file ~ /\.md$/ || file ~ /^docs\//) kind = "現役の文書"
          for (k = 1; k <= n; k++) if (index(body, pat[k]) > 0) printf "%s\t%s:%s\t%s\n", pat[k], file, line, kind
        }' > "$TMP/hits"
fi

# ── 報告 ──
NOW="$(date +%Y-%m-%d)"
echo "# 仕様の片付けの目録（${NOW}・HEAD $(git rev-parse --short HEAD)・トランク ${TRUNK}）"
echo
echo "## 1. 機能ごとの完了の判定"
echo
echo "| 名前 | 種類 | 判定 | tasks.db | 根拠 |"
echo "|---|---|---|---|---|"
awk -F'\t' '{printf "| %s | %s | %s | %s | %s |\n", $1, $2, ($3 == "完了" ? "✅ 完了" : "⏳ 作業中"), $4, $5}' "$TMP/verdict"
echo
echo "- 片付けてよいのは「完了」だけ。作業中の機能には触らない。"
echo
echo "## 2. 文書の区分（本数）"
echo
echo "| 名前 | 判定 | まとめる元 | 運用を移す | 作業用 | 記録 | 計 |"
echo "|---|---|---|---|---|---|---|"
awk -F'\t' '
  { k = $1 SUBSEP $2; if (!(k in seen)) { seen[k] = 1; ord[++n] = k }
    c[k, $3]++; tot[k]++ }
  END { for (i = 1; i <= n; i++) { k = ord[i]; split(k, a, SUBSEP)
          printf "| %s | %s | %d | %d | %d | %d | %d |\n", a[1], a[2], c[k,"まとめる元"], c[k,"運用を移す"], c[k,"作業用"], c[k,"記録"], tot[k] } }' "$TMP/files"
echo
echo "- **まとめる元**: 現役の仕様（docs/spec/current/）へまとめてから片付ける。**運用を移す**: まだ有効な運用の知識を docs/operations.md へ移してから片付ける。"
echo "- **作業用・記録**: そのまま片付ける（Git の履歴に残る）。"
echo
echo "## 3. 参照されている候補（このままでは片付けられない）"
echo
if [ -s "$TMP/hits" ]; then
  echo "| 片付ける候補 | 参照元 | 参照元の種類 |"
  echo "|---|---|---|"
  sort -u "$TMP/hits" | awk -F'\t' '{printf "| `%s` | `%s` | %s |\n", $1, $2, $3}'
  echo
  echo "- **コード・テスト・設定 / 現役の文書**: 参照を直す（文面の正本なら docs/spec/current/texts/ へ移して参照を書き換える）か、そのファイルを残す。"
  echo "- **地図帳**: 片付けと同じコミットで、該当の行を直す。**片付けない機能の文書**: 作業中の機能が参照している。残すか、その機能の作業で直す。"
  echo "- **改定記録・マイグレーション**: 当時の記録なので直さない（適用済みのマイグレーションは書き換えない。ARCHIVE.md から辿れる）。"
else
  echo "該当なし"
fi

if [ -n "$LIST" ]; then
  cp "$TMP/files" "$LIST" || { echo "ERROR: 一覧を書き出せません: $LIST" >&2; exit 2; }
  echo
  echo "（片付けの一覧を書き出しました: $LIST）"
fi
exit 0
