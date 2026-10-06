#!/bin/sh
# power-base — power ワークフローの土台（DevContainer のローカル feature）
#
# power0-onboard が .devcontainer/power-base/ にそのままコピーする。どのリポジトリでも中身は
# 同じなので、ここでは手を加えない（直すときはスキル側の
# .claude/skills/power0-onboard/templates/power-base/ を直す）。
#
# devcontainer.json の features に "./power-base": {} を1行足すと、次が入る:
#   - Claude Code（ネイティブ版）                 … この install.sh
#   - GitHub CLI                                    … devcontainer-feature.json の dependsOn
#   - ホスト（WSL）の gh のログインを共有           … ~/.config/gh をマウントし GH_CONFIG_DIR で指す
#                                                     （コンテナのユーザー名に左右されない）
#   - sqlite3（power4 のタスク DB 用）              … この install.sh
#   - gh auth setup-git・gh-stack など             … コンテナ起動のたびに setup.sh
#
# Claude Code に公式の claude-code feature（npm 版）を使わない理由: Node の無い apt 系イメージ
# （Python・Go・Java などのイメージ）では、あの feature は nodejs だけを入れて npm を入れられず、
# ビルドごと失敗する。ネイティブ版は Node を使わないので、プロジェクトの Node にも触れない。
#
# ~/.claude はマウントしない。PC 側のスキルがリポジトリ側のスキルより優先されてしまうため
# （スキルはリポジトリの .claude/skills/ から読ませる）。
#
# この install.sh はイメージのビルド時に root で1回だけ動く。失敗してもビルドは止めない
# （起動のたびに setup.sh が足りない物を知らせる）。
set -e
warn() { echo "[power-base] 警告: $*"; }

# 1) 足りない道具（sqlite3: power4 のタスク DB 用 / curl: Claude Code の取得用）
need=""
command -v sqlite3 >/dev/null 2>&1 || need="$need sqlite3"
if ! command -v claude >/dev/null 2>&1 && ! command -v curl >/dev/null 2>&1; then
  need="$need curl ca-certificates"
fi
if [ -n "$need" ]; then
  if command -v apt-get >/dev/null 2>&1; then
    { apt-get update \
      && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $need \
      && rm -rf /var/lib/apt/lists/*; } || warn "入れられませんでした:$need"
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache $(echo "$need" | sed 's/sqlite3/sqlite/') bash || warn "入れられませんでした:$need"
  else
    warn "このイメージには自動で入れられません:$need"
  fi
fi

# 2) Claude Code（ネイティブ版）。既にある（イメージや claude-code feature で入っている）なら何もしない。
#    コンテナで作業するユーザーの ~/.local/bin に入るので、/usr/local/bin からも辿れるようにする。
if ! command -v claude >/dev/null 2>&1; then
  U="${_REMOTE_USER:-root}"
  H="${_REMOTE_USER_HOME:-/root}"
  if su "$U" -s /bin/bash -c 'curl -fsSL https://claude.ai/install.sh | bash' && [ -x "$H/.local/bin/claude" ]; then
    [ -e /usr/local/bin/claude ] || ln -s "$H/.local/bin/claude" /usr/local/bin/claude
  else
    warn "Claude Code を入れられませんでした（ネットワークを確かめて、コンテナを再ビルドしてください）"
  fi
fi

# 3) コンテナ起動のたびに動く setup.sh を置く
mkdir -p /usr/local/share/power-base
cp "$(dirname "$0")/setup.sh" /usr/local/share/power-base/setup.sh
chmod 0755 /usr/local/share/power-base/setup.sh
