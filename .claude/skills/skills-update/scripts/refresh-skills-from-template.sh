#!/usr/bin/env bash
# refresh-skills-from-template.sh — 対象 repo の同梱スキルをテンプレートリポジトリの最新で上書きする
#
# 方針: **「持っているか」「新しいか」を判定しない。常にテンプレートの内容で上書きする。**
#   正本はテンプレート1つで、派生 repo 側が「より新しい／より正しい」版を持つ筋書きが存在しない。
#   条件分岐を持たせるほど判定漏れの穴ができる——実際に「一部だけ古い」状態で取り残された前例が
#   2件ある（slide-maker の assets／テンプレの docs/rule）。判定を捨てるのが構造的な対策。
#
# fail-open: 取得に失敗しても **power を止めない**（警告して、いま repo にあるもので続行させる）。
#   テンプレは private なので gh 認証が要る。認証切れやオフラインでワークフロー全体が
#   止まる方が、スキルが1回古いままであることより害が大きい。
#
# 消すのは廃止の一覧に載ったものだけ: テンプレの .claude/skills/RETIRED.txt に載ったパスが
#   この repo に残っていれば git rm する（Git の履歴から戻せる。追跡外・未コミットの変更があるものは消さずに警告）。
#   それ以外でテンプレに無いファイルは ⚠️ で報告するだけ。repo 独自のスキルを消さないため。
#   （写し先にだけあるファイルが「独自に足したもの」か「廃止したもの」かは、一覧が無いと区別できない）
#
# 使い方（対象 repo のルートで実行）:
#   bash .claude/skills/skills-update/scripts/refresh-skills-from-template.sh
#   bash .../refresh-skills-from-template.sh --check   上書きせず差分だけ報告
#
# 取得元（テンプレートの場所）:
#   .claude/skills/template.conf の TEMPLATE_REPO（無ければ ~/.claude/skills/template.conf）。
#   書式は gh と同じ [ホスト/]オーナー/リポジトリ。ホスト付きなら GitHub Enterprise Server として扱う。
#   スクリプト本文に個人名・組織名を書かないための仕組み（展開先ではこのファイルだけ書き換える）。
#
# 環境変数（どちらも一時的な上書き用）:
#   TEMPLATE_REPO       template.conf より優先する取得元
#   TEMPLATE_REPO_PATH  ローカルのクローンを使う（取得を省略。オフライン・開発時用。
#                       **自動検出はしない**——古いクローンを黙って使うと本末転倒なため明示指定のみ）
#
# 終了コード:
#   0 = 最新だった（更新なし）
#   1 = 更新した（--check では「差分あり」）
#   2 = テンプレを取得できなかった（fail-open。呼び出し側は続行すること）

set -uo pipefail

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || ROOT="$PWD"
cd "$ROOT" || exit 2

# ── 取得元の決定: 環境変数 TEMPLATE_REPO → template.conf ──
# template.conf は次の順に探す:
#   1) このリポジトリの .claude/skills/template.conf（このリポジトリが従うテンプレート）
#   2) このスクリプトと同じスキル一式の template.conf（scripts/ から2つ上＝skills/ 直下）
# $HOME/.claude は使わない。Windows の Claude Code から WSL の bash を呼ぶと $HOME は WSL 側になり、
# Windows 側の ~/.claude とは別のディレクトリを指すため（実際に WSL 側にはスキルが無かった）。
CONF=".claude/skills/template.conf"
[ -f "$CONF" ] || CONF="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd)/template.conf"
SLUG="${TEMPLATE_REPO:-}"; SLUG_FROM="環境変数 TEMPLATE_REPO"
if [ -z "$SLUG" ] && [ -f "$CONF" ]; then
  # CRLF で保存されていても値に \r が混ざらないよう落とす
  SLUG="$(sed -n 's/^TEMPLATE_REPO=//p' "$CONF" | tr -d '\r' | head -1)"; SLUG_FROM="$CONF"
fi
# [ホスト/]オーナー/リポジトリ を分解する。ホストが無ければ github.com
HOST="github.com"; REPO="$SLUG"
case "$SLUG" in */*/*) HOST="${SLUG%%/*}"; REPO="${SLUG#*/}" ;; esac

# 同期対象（ディレクトリは中身をミラー、ファイルは単体コピー）
TARGETS=(
  ".claude/skills"
  ".claude/skills-catalog"
  "docs/rule/ai-security-guardrails.md"
)

# ── テンプレートの取得 ────────────────────────────
SRC=""
if [ -n "${TEMPLATE_REPO_PATH:-}" ]; then
  if [ -d "$TEMPLATE_REPO_PATH/.claude/skills" ]; then
    SRC="$TEMPLATE_REPO_PATH"
    echo "取得元  : ローカル指定 $SRC（TEMPLATE_REPO_PATH）"
  else
    echo "⚠️  TEMPLATE_REPO_PATH=$TEMPLATE_REPO_PATH に .claude/skills がありません。取得に切り替えます。" >&2
  fi
fi

if [ -z "$SRC" ]; then
  if [ -z "$SLUG" ]; then
    echo "⚠️  テンプレートの場所が分かりません（template.conf が無いか、TEMPLATE_REPO が空です）。"
    echo "    スキルの更新はスキップし、**いま repo にあるもので続行**します。"
    echo "    復旧: .claude/skills/template.conf に TEMPLATE_REPO=[ホスト/]オーナー/リポジトリ を書く。"
    exit 2
  fi
  TMP="$(mktemp -d)" || { echo "ERROR: 一時ディレクトリを作れません" >&2; exit 2; }
  trap 'rm -rf "$TMP"' EXIT
  FETCHED=0
  # private repo を確実に引けるので gh を優先。GH_HOST で接続先を github.com / Enterprise Server に合わせる。
  # 無ければ素の git（認証情報が設定済みなら通る）。
  if command -v gh >/dev/null 2>&1; then
    GH_HOST="$HOST" gh repo clone "$REPO" "$TMP/tpl" -- --depth 1 --filter=blob:none --sparse >/dev/null 2>&1 && FETCHED=1
  fi
  if [ "$FETCHED" -eq 0 ]; then
    git clone --depth 1 --filter=blob:none --sparse "https://$HOST/$REPO" "$TMP/tpl" >/dev/null 2>&1 && FETCHED=1
  fi
  if [ "$FETCHED" -eq 0 ]; then
    echo "⚠️  テンプレート $SLUG を取得できませんでした（gh 未認証／ネットワーク不通 など）。"
    echo "    試した取得先: https://$HOST/$REPO（設定元: $SLUG_FROM）"
    echo "    スキルの更新はスキップし、**いま repo にあるもので続行**します。"
    echo "    復旧: 'gh auth login' で認証する（Enterprise Server なら --hostname $HOST）／ローカルのクローンがあれば TEMPLATE_REPO_PATH=<path> を指定する。"
    exit 2
  fi
  git -C "$TMP/tpl" sparse-checkout set .claude/skills .claude/skills-catalog docs/rule >/dev/null 2>&1
  SRC="$TMP/tpl"
  echo "取得元  : $SLUG（浅いクローン）"
fi

echo "対象repo: $ROOT"
[ "$CHECK_ONLY" -eq 1 ] && echo "モード  : --check（上書きしません）"
echo

# power/SKILL.md 自身が変わるかを**コピー前に**判定する。
# ディレクトリごと新規配置される場合も拾えるよう、ファイル単位で直接比較する。
POWER_SELF=0
_ss="$SRC/.claude/skills/power/SKILL.md"
_sd="$ROOT/.claude/skills/power/SKILL.md"
[ -f "$_ss" ] && ! diff -q "$_ss" "$_sd" >/dev/null 2>&1 && POWER_SELF=1

# diff -rq の出力を「$s からの相対パス」に直して ADDS/UPDS/EXTS に積む
collect() {
  local s="$1" d="$2" line rest dir name rel
  ADDS=""; UPDS=""; EXTS=""
  while IFS= read -r line; do
    case "$line" in
      "Only in $s"*)
        rest="${line#Only in }"; dir="${rest%%: *}"; name="${rest##*: }"
        rel="${dir#"$s"}"; rel="${rel#/}"
        if [ -n "$rel" ]; then rel="$rel/$name"; else rel="$name"; fi
        ADDS="${ADDS}${rel}"$'\n' ;;
      "Only in $d"*)
        rest="${line#Only in }"; dir="${rest%%: *}"; name="${rest##*: }"
        rel="${dir#"$d"}"; rel="${rel#/}"
        if [ -n "$rel" ]; then rel="$rel/$name"; else rel="$name"; fi
        EXTS="${EXTS}${rel}"$'\n' ;;
      "Files "*" differ")
        rest="${line#Files }"; rest="${rest%% and *}"
        rel="${rest#"$s"}"; rel="${rel#/}"
        UPDS="${UPDS}${rel}"$'\n' ;;
    esac
  done < <(diff -rq "$s" "$d" 2>/dev/null)
}

CHANGED=0
EXTRAS=""

# ── 廃止したファイル（テンプレの .claude/skills/RETIRED.txt）を消す ──
# 上書きより先に行う。一覧は `.claude/` からの相対パス（末尾 / はディレクトリ）。
RET_FILE="$SRC/.claude/skills/RETIRED.txt"
RET_LIST=""   # 残っていた廃止のパス（.claude/ 付き）。下の ⚠️ 一覧から外すのに使う
# $1 が廃止のパスそのものか、その下にあれば 0
is_ret() {
  local f="$1" r
  while IFS= read -r r; do
    [ -n "$r" ] || continue
    case "$f" in "$r"|"$r"/*) return 0 ;; esac
  done <<< "$RET_LIST"
  return 1
}
# $1（ファイルかディレクトリ）の中身が、すべて廃止のパスなら 0。
# 親ディレクトリごとテンプレに無いと diff はディレクトリ単位で報告するので、中身で判定する。
only_retired() {
  local x="$1" f
  [ -n "$RET_LIST" ] || return 1
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    is_ret "$f" || return 1
  done < <(cd "$ROOT" && find "$x" -type f 2>/dev/null)
  return 0
}
if [ -f "$RET_FILE" ]; then
  echo "── 廃止したファイル（.claude/skills/RETIRED.txt） ──"
  NRET=0
  while IFS= read -r line || [ -n "$line" ]; do
    rel="$(printf '%s' "$line" | tr -d '\r' | sed 's/[[:space:]]*$//')"
    case "$rel" in ''|'#'*) continue ;; esac
    case "$rel" in
      *..*|/*) continue ;;
      skills/?*|skills-catalog/?*) ;;
      *) continue ;;
    esac
    q="${rel%/}"
    [ -e "$SRC/.claude/$q" ] && continue    # テンプレに在る＝復活した。消さない
    [ -e "$ROOT/.claude/$q" ] || continue
    NRET=$((NRET+1))
    RET_LIST="${RET_LIST}.claude/$q"$'\n'
    if [ "$CHECK_ONLY" -eq 1 ]; then
      echo "  🗑  （引数なしで実行すると消す）.claude/$q"; CHANGED=1
    elif git -C "$ROOT" rm -r -q -- ".claude/$q" >/dev/null 2>&1; then
      echo "  🗑  git rm: .claude/$q"; CHANGED=1
    else
      echo "  ⚠️  消せませんでした（Git で追跡していないか、まだコミットしていない変更があります）: .claude/$q"
      echo "      テンプレで廃止したファイルです。中身を確かめて、不要なら手で消してください。"
    fi
  done < "$RET_FILE"
  [ "$NRET" -eq 0 ] && echo "  ✅ 残っているものはありません"
  echo
fi

for p in "${TARGETS[@]}"; do
  S="$SRC/$p"; D="$ROOT/$p"

  if [ ! -e "$S" ]; then
    echo "SKIP  $p （テンプレ側に存在しません）"
    echo
    continue
  fi

  echo "── $p ──"
  NEED=0

  if [ -d "$S" ]; then
    if [ ! -d "$D" ]; then
      N="$(find "$S" -type f 2>/dev/null | wc -l | tr -d ' ')"
      echo "  ＋ ディレクトリごと新規配置（${N} ファイル）"
      NEED=1
    else
      collect "$S" "$D"
      if [ -n "${ADDS}${UPDS}" ]; then
        NEED=1
        [ -n "$ADDS" ] && printf '%s' "$ADDS" | grep -v '^$' | sed 's|^|  ＋ |'
        [ -n "$UPDS" ] && printf '%s' "$UPDS" | grep -v '^$' | sed 's|^|  ↻ |'
      fi
      if [ -n "$EXTS" ]; then
        while IFS= read -r e; do
          [ -n "$e" ] || continue
          # 廃止の一覧で扱ったもの（--check で残っているもの）は上で報告済み
          only_retired "$p/$e" && continue
          EXTRAS="${EXTRAS}     $p/$e"$'\n'
        done <<< "$EXTS"
      fi
    fi
  else
    if [ ! -f "$D" ]; then
      echo "  ＋ 新規配置"; NEED=1
    elif ! diff -q "$S" "$D" >/dev/null 2>&1; then
      echo "  ↻ 更新"; NEED=1
    fi
  fi

  if [ "$NEED" -eq 0 ]; then
    echo "  ✅ 最新"
  else
    CHANGED=1
    if [ "$CHECK_ONLY" -eq 0 ]; then
      if [ -d "$S" ]; then
        mkdir -p "$D"
        cp -r "$S/." "$D/" || { echo "ERROR: コピーに失敗: $p" >&2; exit 2; }
      else
        mkdir -p "$(dirname "$D")"
        cp "$S" "$D" || { echo "ERROR: コピーに失敗: $p" >&2; exit 2; }
      fi
    fi
  fi
  echo
done

# ── 報告 ────────────────────────────
if [ -n "$EXTRAS" ]; then
  echo "⚠️  テンプレに無いファイル（自動削除しません）:"
  printf '%s' "$EXTRAS" | grep -v '^[[:space:]]*$'
  echo "    repo 独自のものならそのままで構いません（テンプレで廃止したものは RETIRED.txt に載せれば次から自動で消えます）。"
  echo
fi

if [ "$CHANGED" -eq 0 ]; then
  echo "結果: 同梱スキルはテンプレートと一致しています（更新なし）。"
  exit 0
fi

if [ "$CHECK_ONLY" -eq 1 ]; then
  echo "結果: 差分あり → 引数なしで再実行すると上書きします。"
  exit 1
fi

echo "結果: テンプレートの最新で上書きしました。"
echo "      .claude/ は git 管理下なので、意図しない上書きは 'git diff' で確認・復元できます。"
if [ "$POWER_SELF" -eq 1 ]; then
  echo
  echo "★ power/SKILL.md 自身が更新されました。"
  echo "  実行中のオーケストレーターは**起動時に読み込んだ古い指示のまま**動きます"
  echo "  （後続の power1〜6 は Skill 呼び出し時に新版が読まれます）。"
  echo "  指示そのものを最新にしたい場合は、いったん中断して /power を再実行してください。"
fi
exit 1
