---
name: beam-sync
description: beam / power が生成したファイルを Git/GitHub に反映する連携スキル。トランクベース（常設の develop は持たない）で、各フェーズは前フェーズのブランチ上で直接作業してフェーズ専用ブランチにコミットし、GitHub ネイティブの Stacked Pull Requests（gh stack link）としてスタックに積み、gh stack merge でアトミックにトランクへ取り込みます。beam フェーズ（beam1〜beam5）と power フェーズ（power1-4 / power5-phaseN / power6）の完了時に呼び出されます。冪等で、秘密情報（.env）は絶対にコミットしません。
allowed-tools: Bash, Read, Write, Edit, Glob, AskUserQuestion
argument-hint: "[要件名/機能名] [phase: beam1|…|beam5-phaseN|power1-4|power5-phaseN|power6]"
---

あなたは beam / power ワークフローの **Git 連携担当**です。各フェーズの生成物を**そのフェーズ専用のブランチ**にコミットし、**フェーズごとに独立した Pull Request** を作って **GitHub ネイティブの Stacked Pull Requests** としてスタックに積みます。**冪等**に動作し（再実行で重複コミット・重複 PR を作らない）、**秘密情報を絶対にコミットしません**。

> **名前は beam- だが beam 専用ではない。** スタック機構（ブランチ確保・`gh stack link`・cascade rebase 追従）は微妙で、二重に持つと必ずドリフトする。そのため **beam・power・revise の3者がこの1本を共有**する。power から呼ぶときの差分は「フェーズ名」と「要約に読むファイル」だけで、機構は同一である。

> **前提**: GitHub の Stacked Pull Requests（2026-07-30 public preview）と `gh stack` 拡張（`github/gh-stack`）を使用する。拡張は DevContainer の post-create で導入済み。**public preview のため仕様変更の可能性がある**。`gh stack` が使えない環境では step1 で中断し、人間に案内する（手動でのスタック運用にフォールバックしない＝中途半端な状態を作らない）。

# ブランチ戦略（トランクベース＋必要時リリースブランチ）

本スキルは **Trunk-Based Development ＋ Branch for Release**（Google / Chromium 等が大規模で採る形）を採用する。

- **トランクは1本だけ**（リポジトリの既定ブランチ＝通常 `main`）。**常設の統合ブランチ（`develop`）は持たない。**
- 各フェーズは**前フェーズのブランチ上で直接作業**し、自分のブランチにコミットする。祖先関係が本物なので、上段のブランチは下段の成果を**必ず含む**（＝作業ツリーは常に完全）。
- **ファイルのコピーは一切しない。** 過去に `develop` から `git checkout develop -- {パス}` で複製する方式を採っていたが、これは「内容は同じだが祖先関係が無いコミット」を生み、`develop` がトランクへ永久に合流できない・レビュー修正が次フェーズで静かに巻き戻る、という問題があった。**本スキルはこの方式を廃止した。**
- **トランクを常にリリース可能に保つ**仕組みは以下の2点で担保する（`develop` は不要）:
  1. **beam1〜beam4 の生成物はドキュメント**（`note.md` / `requirements.md` / `design/*` / `TASK-*.md`）であり、マージしてもビルド・デプロイを壊さない。都度マージしてよい。
  2. **beam5（コード）は実装フェーズをスタックに保持したまま検証し、`gh stack merge` でアトミックに落とす**。all-or-nothing なので、トランクが「未完成の機能が半分だけ入った状態」を経由しない。
- **リリースブランチは必要になるまで作らない**（後述の「リリースブランチ」節）。

# context

- 引数: `{要件名} {phase}`（power では `{要件名}` の位置に `{機能名}` を渡す。以下まとめて `REQ`）
  - beam: `beam1` / `beam2` / `beam3` / `beam4` / `beam5` / `beam5-phaseN`（N=実装フェーズ番号）
  - power: `power1-4` / `power5-phaseN` / `power6`
- トランク: **リポジトリの既定ブランチ**（通常 `main`。to-prd が作成）。決め打ちにせず `gh repo view --json defaultBranchRef` で解決し、取得できなければ `main` にフォールバックする（以下 `$TRUNK`）
- フェーズブランチ: **`{phase}-{REQ}`**（例 `beam4-task-bridge` / `beam5-phase2-task-bridge` / `power5-phase1-wordbook-v2`）。**作業も PR もこのブランチ上で行う**
  - **例外は `power1-4` だけで、ブランチ名は `feature/{機能名}`**。power1 が機能名確定時に作る既存の名前をそのまま使う（power1〜4・revise・各スキルの既存記述を変えずに済むため）。

# power のスタック構成

```
$TRUNK
 └ feature/{機能名}           ← power1〜power4（ドキュメント）      phase: power1-4
    └ power5-phase1-{機能名}  ← 実装 Phase 1（レビュー済み）        phase: power5-phase1
       └ power5-phase2-{機能名}
          └ power6-{機能名}   ← 検証・要件適合・統合レビュー        phase: power6
```

- **フェーズが1つしかない機能なら自然に「feature → power5-phase1 → power6」の3段**になる。段数は power4 が決めたフェーズ数で決まる。
- **upstream（OSS 本家）モードではスタックを使わない。** power6 の 6-3 が process 生成物を除いた**機能コードだけの1本のクリーン PR**（`pr/{機能名}`）を作る。本家メンテナに要件定義書や理解ブリーフを段階的に送る選択肢は無いため。**本スキルは own モードでのみ呼ばれる。**

# 方針（設計）

- **フェーズごとに別ブランチ＋別 PR＋ネイティブスタック**: 各フェーズが自分専用のブランチと PR を持つ。**beam5 は実装フェーズ（Phase 1, 2, …）ごとに別 PR**（`beam5-phaseN-{要件名}`）。作成した PR は `gh stack link` で**フェーズ順（下から上）にスタックへ積む**。スタック最下段の base は `$TRUNK`。
- **PR の中身はそのフェーズの差分のみ**: 各ブランチは前フェーズのブランチ（未マージなら）から切るため、PR の差分には**そのフェーズで加えた変更だけ**が出る。
- **マージは `gh stack merge`（アトミック）**: 「スタックの下から選んだ PR までを、単一の all-or-nothing 操作で base ブランチへマージする。どれか1つでもマージできなければ、どれもマージされない」。**マージ順の人手管理・ブランチ削除の運用・base の張り替えは一切不要**。下位 PR がマージされると GitHub が上位 PR を自動でリベース＋リターゲットするため、**取り残される PR が原理的に発生しない**。
  - 部分マージも可能（「一番下から連続した範囲」であれば、選んだ PR までをまとめてマージ）。フェーズごとのレビュー関門はこれで維持できる。
  - **スカッシュは使わない**（**フェーズ単位の履歴をトランク上に残すため**）。`--merge`（マージコミット）を既定とする。
    - ※ 理由を取り違えないこと。ネイティブスタックでは GitHub が上位 PR を自動でリベース／リターゲットするため、`--squash` を使っても**スタックが壊れるわけではない**（`gh stack merge --squash` は公式にサポートされる）。マージコミットを既定にするのは「各フェーズの PR を履歴として残す」という beam の設計意図によるものであり、「壊れるから」ではない。
    - ⚠️ **base ブランチに merge queue がある場合、マージ方法はキューが決める**。公式仕様では `--merge-method` / `--merge` / `--squash` / `--rebase` は**警告付きで無視される**ため、上記の既定は保証されない。merge queue を使うなら、キュー側のマージ方法をマージコミットに設定すること。
- **`code-map.md` も PR に含める**: 実装の現状インデックスは成果物の一部であり、フェーズごとの差分として出るのが自然。スタックでは上段が下段を祖先として含むため、次フェーズは何もしなくても最新の `code-map.md` を読める。
- **サーバー側リベースを前提にする**: スタックのマージにより、**リモートのフェーズブランチは SHA が変わる**（cascade rebase）。push が拒否されたら**公式の `gh stack sync`**（fetch → rebase → lease 付き push を1コマンドで行う）に追従を任せる。

# 引数の解釈

- 引数 1 = `{要件名}`（省略時は Bash `pwd` の basename。`REQ` とする）
- 引数 2 = `{phase}`（コミット/PR のタイトルとブランチ名に使う。未指定時は `beam`）

# 設計原則（重要）

- **秘密情報を絶対にコミットしない（P0）**: `.env` 等は `.gitignore` で除外し、コミット直前にステージ内容を再チェックする。
- **冪等**: 差分が無ければコミットしない／フェーズ PR が既にあれば作らない（ブランチは積み増しで更新）。
- **非破壊**: トランクへ直接コミットしない。**自前で force push しない**（cascade rebase 後の追従は `gh stack sync` に任せる。内部で `--force-with-lease` 付きの push を行う公式手順）。
- **呼び出し元を止めない**: git リポジトリでない／`gh` 未認証／git identity 未設定なら、**手順を案内して中断**する（呼び出し元フェーズは続行可能）。

# フェーズ → コミット/PR タイトル

| phase | タイトル（`<COMMIT_MSG>` / `<TITLE>`） |
|---|---|
| `beam1` | `beam1: コンテキストノート（{要件名}）` |
| `beam2` | `beam2: 要件定義（{要件名}）` |
| `beam3` | `beam3: 技術設計（{要件名}）` |
| `beam4` | `beam4: タスク分解（{要件名}）` |
| `beam5` | `beam5: 実装（{要件名}）` |
| `beam5-phaseN` | `beam5: 実装 Phase N（{要件名}）` |
| `power1-4` | `power1-4: 理解・設計（{機能名}）` |
| `power5-phaseN` | `power5: 実装 Phase N（{機能名}）` |
| `power6` | `power6: 検証（{機能名}）` |
| 上記以外 | `beam: {phase}（{要件名}）` |

---

## step1: 前提チェック（満たさなければ案内して中断）

```bash
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || echo "NOT_A_GIT_REPO"
gh auth status 2>&1 | head -5         # repo スコープで認証済みか
git config user.name; git config user.email
gh stack --help >/dev/null 2>&1 || echo "NO_GH_STACK"   # Stacked PR 拡張が使えるか
```

- **非 git リポジトリ**: 「Git 連携をスキップしました。to-prd で作成したリポジトリ内で実行してください」と伝えて終了。
- **gh 未認証/スコープ不足**: 「`gh auth login`（または `gh auth refresh -s repo`）で**この環境（実行中のシェル／DevContainer）**を認証してください」と伝えて終了。
- **git identity 未設定**: 「`git config --global user.name/user.email` を設定してください」と伝えて終了。
- **`NO_GH_STACK`**: 「`gh extension install github/gh-stack` を実行してください（通常は DevContainer の post-create で導入済みです。コンテナを再ビルドすると復旧します）」と伝えて**終了する**。
  - **手動スタック運用へフォールバックしない。** base を手で張り替える運用は「マージしても トランクに届かない PR」を生みやすく、しかも GitHub 上は全 PR が緑の Merged に見えるため発覚しにくい。中途半端に進めるより中断する方が安全である。

> ⚠️ beam5 は DevContainer 内で動くため、**コンテナ側でも** `gh` 認証・git identity・`gh-stack` 拡張が必要。

## step2: .gitignore の整備（秘密・生成物の除外。冪等）

リポジトリルートの `.gitignore` にマーカー `# >>> beam-sync managed >>>` が無ければ**追記**する（あれば何もしない）。

**⚠️ 追記の前に「既存ファイルが改行で終わっているか」を必ず確認する。** テンプレート由来の `.gitignore` は**末尾に改行が無い**ことがあり（最終行が `playwright/.cache/`）、そのまま追記すると `playwright/.cache/# >>> beam-sync managed >>>` と最終行が結合して**元のパターンとマーカーの両方が壊れる**。しかもマーカー文字列は部分一致で見つかるため、冪等チェックが「すでに整備済み」と誤判定して永久に修復されない。

```bash
# 末尾に改行が無ければ足してから追記する（空ファイル・ファイル無しも安全に扱う）
if ! grep -q '# >>> beam-sync managed >>>' .gitignore 2>/dev/null; then
  if [ -s .gitignore ] && [ "$(tail -c 1 .gitignore)" != "" ]; then
    printf '\n' >> .gitignore
  fi
  cat >> .gitignore << 'EOF'
<下記のブロック>
EOF
fi
```

```gitignore
# >>> beam-sync managed >>>
# 秘密情報（絶対にコミットしない）
.env
.env.*
!.env.example
# タスク管理 DB（バイナリ。TASK-*.md から再生成可能なため除外）
data/*.db
data/*.db-wal
data/*.db-shm
# 生成物・依存
node_modules/
dist/
logs/
# ダッシュボード配布バンドル（生成物）
.beam/dashboard/dist/
.beam/dashboard/node_modules/
.beam/dashboard/data/
.beam/dashboard/logs/
.beam/dashboard/dashboard.pid
# <<< beam-sync managed <<<
```

## step3: フェーズブランチの確保（前フェーズの上にスタックする）

呼び出し時点で、このフェーズの生成物は**作業ツリーに未コミットで置かれている**（呼び出し元の beam フェーズが生成したもの）。それを**引き連れたまま**フェーズブランチへ移動する。

**`<解決ブロック>`（下記）を実行して `BR` / `TRUNK` / `PREV_PHASE` / `PREV_BR` を確定する。** step5 でも同じブロックを再実行する（別プロセスで動いても成立させるため）。

```bash
# ============ <解決ブロック> ここから ============
# ブランチ名の導出（power1-4 だけ既存の feature/{機能名} を使う。それ以外は {phase}-{REQ}）
phase_branch() {
  case "$1" in
    power1-4) echo "feature/${REQ}" ;;
    *)        echo "${1}-${REQ}" ;;
  esac
}
BR="$(phase_branch "$PHASE")"   # 例: beam4-task-bridge / power5-phase2-wordbook-v2 / feature/wordbook-v2

# --- トランクを解決する（main / master / 任意名のいずれでも動く） ---
TRUNK="$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name 2>/dev/null || true)"
[ -n "$TRUNK" ] || TRUNK=main

has_open_pr() {  # $1=ブランチ名
  [ "$(gh pr list --head "$1" --state open --json number --jq 'length' 2>/dev/null || echo 0)" != "0" ]
}

# --- 直前フェーズを決める ---
case "$PHASE" in
  beam2)               PREV_PHASE="beam1" ;;
  beam3)               PREV_PHASE="beam2" ;;
  beam4)               PREV_PHASE="beam3" ;;
  beam5|beam5-phase1)  PREV_PHASE="beam4" ;;
  beam5-phase*)        n="${PHASE#beam5-phase}"; PREV_PHASE="beam5-phase$((n-1))" ;;
  power5-phase1)       PREV_PHASE="power1-4" ;;
  power5-phase*)       n="${PHASE#power5-phase}"; PREV_PHASE="power5-phase$((n-1))" ;;
  power6)              PREV_PHASE="" ;;     # 下で動的に解決する
  *)                   PREV_PHASE="" ;;     # beam1 / power1-4 / 不明な phase は $TRUNK 基点
esac

# power6 の直前は「最も高い実装フェーズ」。フェーズ数は power4 が決めるので固定できない。
# 降順に走査して最初に見つかった open な PR を持つフェーズを採り、1つも無ければ power1-4 に落とす。
if [ "$PHASE" = "power6" ]; then
  for n in $(seq 20 -1 1); do
    if has_open_pr "power5-phase${n}-${REQ}"; then PREV_PHASE="power5-phase${n}"; break; fi
  done
  [ -n "$PREV_PHASE" ] || PREV_PHASE="power1-4"
fi

PREV_BR=""
[ -n "$PREV_PHASE" ] && PREV_BR="$(phase_branch "$PREV_PHASE")"
# ============ <解決ブロック> ここまで ============

git fetch origin "$TRUNK" >/dev/null 2>&1 || true

# --- 分岐点を決める ---
# 「前フェーズがまだスタックに居るか（= open な PR を持つか）」で判定する。
# マージ済み／未作成なら $TRUNK から切る。ブランチの存在有無ではなく PR の状態を見るのは、
# マージ後もブランチが残っている場合に古い基点を選ばないため。
BASE_REF="origin/$TRUNK"; PR_BASE="$TRUNK"
if [ -n "$PREV_BR" ] && has_open_pr "$PREV_BR"; then
  git fetch origin "$PREV_BR" >/dev/null 2>&1 || true
  BASE_REF="origin/$PREV_BR"; PR_BASE="$PREV_BR"
fi

# --- フェーズブランチへ移動する（未コミットの生成物は引き連れられる） ---
CUR="$(git branch --show-current)"
if [ "$CUR" = "$BR" ]; then
  :                                        # 同じフェーズの再実行。そのまま積み増す
elif git show-ref --verify --quiet "refs/heads/$BR"; then
  git checkout "$BR"                       # 既存のローカルブランチへ
elif git ls-remote --exit-code --heads origin "$BR" >/dev/null 2>&1; then
  git fetch origin "$BR" >/dev/null 2>&1 || true
  git checkout -b "$BR" "origin/$BR"
elif [ -n "$PREV_BR" ] && [ "$CUR" = "$PREV_BR" ]; then
  git checkout -b "$BR"                    # 既に前フェーズのブランチ上にいる＝現在地から分岐（最も安全）
else
  git checkout -b "$BR" "$BASE_REF"
fi
```

- **ファイルのコピーはしない。** 前フェーズの成果物はブランチの祖先として既に含まれているため、作業ツリーは常に完全である。
- **`git checkout -b` は未コミットの変更を引き連れる**ので、呼び出し元が生成したファイルは失われない。切替が競合で失敗した場合は、その旨を報告して中断する（勝手に stash・破棄をしない）。
- 既に前フェーズのブランチ上にいる通常ケースでは、**現在地からそのまま分岐**する（`$BASE_REF` を指定するとリモートとのズレで競合しうるため）。

## step4: コミットと push（秘密ガード付き・冪等）

```bash
git add -A   # .gitignore で .env / data/*.db / node_modules / dist / logs 等は自動除外

# 秘密の最終ガード（P0）: .env 系がステージされていたら取り消す（.env.example は残す）
leaked="$(git diff --cached --name-only | grep -E '(^|/)\.env(\..+)?$' | grep -vE '(^|/)\.env\.example$' || true)"
if [ -n "$leaked" ]; then git reset -- $leaked; echo "WARNING: 秘密ファイルを除外（P0）: $leaked"; fi

if git diff --cached --quiet; then
  echo "NO_CHANGES: このフェーズの差分なし（コミットはスキップ）"
else
  git commit -m "<COMMIT_MSG>" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
fi

# push。リモートが cascade rebase で進んでいると拒否されるため、公式コマンドで追従して委ねる。
if ! git push -u origin "$BR" 2>/dev/null; then
  echo "PUSH_REJECTED: リモートが進んでいます。gh stack sync で追従します"
  gh stack sync || echo "STACK_SYNC_FAILED: 手動で 'gh stack sync' を実行してください"
fi
```

- 差分が無ければコミットを作らない（**冪等**）。ブランチと PR が既にあれば step5 で body だけ最新化される。
- **`git push` が失敗しても自前で `--force` しない。** `gh stack sync` が fetch → rebase → `--force-with-lease` 付き push をまとめて行う公式手順なので、それに委ねる。

## step5: Pull Request の作成/更新（冪等。説明 body を自動生成）

フェーズブランチ `{phase}-{要件名}` → **その base（前フェーズ／無ければ `$TRUNK`）** の PR を確保する。**説明（body）は下記の3欄構成で自動生成**し、再実行時は body も最新化する。

### body の構成（必ずこの順・この見出しで作る）

```markdown
## 【概要】
（このフェーズの変更が何であるかを、箇条書きにしない日本語の散文で 2〜4 文で述べる）

## 【フェーズ要約】
（下の「フェーズ別 要約項目」に従い、生成ファイルから抽出した要点を記す）

## 【変更一覧】
| ファイル | 変更の概要 |
|---|---|
| <パス> | <そのファイルで追加/変更した内容の一言> |

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- **【概要】**: プレーンな日本語の**散文**（箇条書き禁止）。
- **【フェーズ要約】**: 数値・要点は**生成ファイルを読んで**埋める（会話の記憶に頼らない）。
- **【変更一覧】**: この PR の差分ファイルを 1 行ずつ。対象は `git diff --name-only "origin/${PR_BASE}...${BR}"`（`PR_BASE` は step3 と同じ＝前フェーズのブランチ、最初のフェーズは `$TRUNK`）で取得する。各「変更の概要」は簡潔に（タスク名は `overview.md` 等から流用してよい。全ファイルを精読しない）。

### フェーズ別 要約項目（【フェーズ要約】の中身）

| phase | 読むファイル | 要約に入れる項目 |
|---|---|---|
| beam1 | `docs/spec/{要件名}/note.md` | 技術スタック/ランタイム、関連実装・参照、注意点の要点 |
| beam2 | `docs/spec/{要件名}/requirements.md` ほか | REQ/NFR/EDGE 件数、ユーザーストーリー数、受け入れ基準数、信頼性分布（🔵🟡🔴）、未解決事項の件数 |
| beam3 | `docs/spec/{要件名}/design/*` ・ `requirements.md` | 確定した未解決事項の件数、主要アーキ判断、IF/エンドポイント/スキーマの規模、信頼性分布、prep.md の更新有無 |
| beam4 | `docs/tasks/{要件名}/overview.md` | タスク総数、合計SP、フェーズ数、要件カバレッジ（⭕/🟢/❌） |
| beam5-phaseN | `docs/implements/{要件名}/*`（verify-report 等） | 実装した TASK 一覧、test/typecheck/lint 結果、要件適合（⭕/🟢/❌）、code-review の結果（CRITICAL/HIGH=0） |
| power1-4 | `docs/spec/{機能名}/feature-requirements.md`・`understanding-brief.md`・`design/`・`docs/tasks/{機能名}/overview.md`・`docs/code-map.md` | FR/NFR/AC 件数、確定 INT・REG 件数、**既存要件との矛盾（power2 step4-1）の有無と `/revise` の予定**、タスク総数・合計SP・フェーズ数、信頼性分布、**code-map の根拠検証結果（N 件 / 失敗 0）**。**この PR が人間のレビュー地点**である旨を【概要】に明記する |
| power5-phaseN | `docs/implements/{機能名}/*` | 実装した TASK 一覧、test/typecheck/lint 結果、code-review の結果（CRITICAL/HIGH=0）、既存規約への準拠で迷った点 |
| power6 | `docs/tasks/{機能名}/conformance-report.md`・review レポート | 要件適合（⭕/🟢/❌）、**回帰結果（各 REG: 維持/影響）**、実環境動作（QA-1〜5）、統合レビューの結果、code-map 根拠の再検証結果 |

### 実行

1. 上記に従って body を組み立て、**一時ファイルに書き出す**（`Write` で `/tmp/beam-sync-pr-body.md` へ。リポジトリ外なのでコミットされない）。
2. PR を作成または更新する:

```bash
# step3 の <解決ブロック> をそのまま再実行する（別プロセスで動いても成立させるため再導出する）。
# これで BR / TRUNK / PREV_PHASE / PREV_BR / phase_branch / has_open_pr がそろう。
# ★step3 と同じ規則でなければならない。片方だけ直すと base とブランチがずれる。

PR_BASE="$TRUNK"
if [ -n "$PREV_BR" ] && has_open_pr "$PREV_BR"; then
  PR_BASE="$PREV_BR"
fi

open="$(gh pr list --head "$BR" --state open --json number --jq 'length' 2>/dev/null || echo 0)"
if [ "$open" = "0" ]; then
  gh pr create --base "$PR_BASE" --head "$BR" --title "<TITLE>" --body-file /tmp/beam-sync-pr-body.md
else
  # 再実行時は body を最新化する。
  # base は「現在の base と食い違うときだけ」変更する。ネイティブスタックでは GitHub が
  # 下位のマージ後に上位 PR の base を自動リターゲットするため、毎回 --base を送ると
  # その結果を無用に上書きしにいくことになる（同値なら API 書き込み自体を行わない）。
  CUR_BASE="$(gh pr view "$BR" --json baseRefName --jq .baseRefName 2>/dev/null || true)"
  if [ -n "$CUR_BASE" ] && [ "$CUR_BASE" = "$PR_BASE" ]; then
    gh pr edit "$BR" --title "<TITLE>" --body-file /tmp/beam-sync-pr-body.md
  else
    gh pr edit "$BR" --base "$PR_BASE" --title "<TITLE>" --body-file /tmp/beam-sync-pr-body.md
  fi
fi
```

- `<TITLE>` は「フェーズ → コミット/PR タイトル」表に従って置換する。
- このフェーズの差分がまったく無くブランチも未作成なら「このフェーズの生成物がないため PR なし」と報告する。

### ネイティブスタックへの登録（`gh stack link`。必ず実行する）

PR を作った/更新したら、**その要件の open な beam PR をフェーズ順（下から上）にスタックへ登録する**。これによりマージ順の強制・自動 cascade rebase・アトミックマージが GitHub 側で担保される。

`gh stack link` は**冪等**である。公式ドキュメントのとおり「既にスタックに入っている PR があれば、既存のスタックを更新して新しい PR を含める（既存の PR は決して除去されない＝追加のみ）」ため、**毎回フルのリストを渡してよい**。スタック番号を追跡する必要はない。

```bash
TRUNK="$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name 2>/dev/null || true)"
[ -n "$TRUNK" ] || TRUNK=main

# フェーズ順（下から上）に、open な PR を持つブランチだけを列挙する。
# マージ済みのフェーズは open な PR を持たないので自然に外れる（スタックは常に「未マージ分」を表す）。
#
# 【順序の根拠】この列挙順がスタックの段順になるため、step3 の分岐規則（どのブランチから切ったか）と
# 必ず一致させる。素の `beam5` は step3 で **beam4 から** 切られる＝`beam5-phase1` と同じ高さの
# 「兄弟」であり、両者を1本のスタックに直列で並べることは本来できない。よって `beam5` は
# beam4 の直後（phase 群より下）に置く。実運用では beam5-implement が常に `beam5-phaseN` を
# 渡すため両者は共存せず、どちらか一方だけが列挙される。
# どちらのワークフローの phase で呼ばれたかで列挙順を切り替える。
case "$PHASE" in
  power*)
    ORDER="power1-4"
    for n in $(seq 1 20); do ORDER="$ORDER power5-phase$n"; done
    ORDER="$ORDER power6"
    ;;
  *)
    ORDER="beam1 beam2 beam3 beam4 beam5"
    # beam5 の実装フェーズは PR を分けるため、存在する分を昇順で足す
    for n in $(seq 1 20); do ORDER="$ORDER beam5-phase$n"; done
    ;;
esac

STACK_BRANCHES=""
for p in $ORDER; do
  b="$(phase_branch "$p")"
  if has_open_pr "$b"; then
    STACK_BRANCHES="$STACK_BRANCHES $b"
  fi
done

# 2本以上そろって初めてスタックになる（1本だけなら通常の PR のままでよい）
if [ "$(echo $STACK_BRANCHES | wc -w)" -ge 2 ]; then
  gh stack link --base "$TRUNK" $STACK_BRANCHES
  gh stack view --short 2>/dev/null || true
else
  echo "STACK_SKIP: open な PR が1本のみ。スタック化は不要"
fi
```

- `--base "$TRUNK"` は**スタック最下段の base**。既定でリポジトリのデフォルトブランチだが、明示しておく（`$TRUNK` は決め打ちせず `gh repo view` で解決する）。
- 列挙順が**スタック順序そのもの**になる。`ORDER` は必ずフェーズの依存順（＝step3 でどのブランチから切ったか）に保つこと。
- 登録結果（スタック番号・段数）は step6 の報告に含める。

## step6: 完了報告

呼び出し元（beam フェーズ）と人間に簡潔に報告する:

- フェーズブランチ `{phase}-{要件名}`: 作成/更新したか、**base（前フェーズ／`$TRUNK`）**、コミットしたか（メッセージ）／差分なしでスキップしたか、push 結果
- PR: 新規作成（**URL**）／既存（更新）／対象なし
- **スタックの状態**: `gh stack link` で登録した段数（と `gh stack view --short` の出力）。1本のみで `STACK_SKIP` になった場合はその旨
- **マージの方針（そのまま案内する）**:

  | 対象 | 方針 |
  |---|---|
  | **beam1〜beam4**（ドキュメント） | **都度マージしてよい。** トランクのリリース可能性に影響しないため、早く落として乖離を小さく保つ |
  | **beam5-phaseN**（コード） | **全実装フェーズの完了・検証まではスタックに保持し、最後にアトミックにマージする。** all-or-nothing なので、トランクが「機能が半分だけ入った状態」を経由しない |
  | **power1-4 / power5-phaseN / power6** | **スタック全体を最後にまとめてマージする（1機能＝1マージ単位）。** power1-4 はドキュメントのみなので単独で落としてもトランクは壊れないが、**単独マージしないこと**——ここは**レビュー地点であってマージ地点ではない**。先に落とすと「1機能＝1マージ単位」が崩れ、要件だけ入って実装が無い状態がトランクを通過する |

  ```bash
  gh stack view                      # どこまで積まれているか確認
  gh stack merge --merge --yes       # スタック全体をアトミックにマージ（all-or-nothing）
  # レビュー関門としてフェーズ単位で止めたい場合は、そこまでの PR 番号を指定する
  gh stack merge {PR番号} --merge --yes   # 指定 PR までを一括マージ（下位は自動で含まれる）
  ```

  - **下から上への順序・base の張り替え・ブランチ削除はすべて GitHub 側が面倒を見る**ため、人手で管理しない
  - **`--squash` は使わない**（**フェーズ単位の履歴を残すため**。スタックが壊れるからではない——ネイティブスタックは上位 PR を自動リベースするので `--squash` 自体は公式にサポートされる）
  - ⚠️ **base ブランチに merge queue がある場合、`--merge` / `--squash` / `--rebase` / `--merge-method` は警告付きで無視される**（マージ方法はキューが決める）。その環境では上記の「マージコミット既定」が効かないため、**キュー側の設定をマージコミットに揃える**か、スカッシュされる前提で運用する
  - マージできない PR が1つでもあれば**どれもマージされない**ので、中途半端にトランクへ入る状態が起きない
  - 「Rebase stack」ボタンが GitHub 上に出た場合は、トランクが動いてスタックの線形性が失われた合図。`gh stack sync` またはボタンでリベースしてからマージする
- 前提未達でスキップした場合は、必要な設定（`gh auth login` / `gh extension install github/gh-stack` 等）を明記

---

## リリースブランチ（必要になったときだけ作る）

平時は**トランク1本だけ**で運用し、リリースブランチは作らない。**「リリースを凍結したまま、トランクは先へ進めたい」という状況が実際に発生したときだけ**、トランクから切る。

```bash
git checkout "$TRUNK" && git pull --ff-only
git checkout -b release/1.2          # 例。凍結したい時点のトランクから切る
git push -u origin release/1.2
```

**守るべき規律は1つだけ**:

> **修正は必ずトランクで行い、リリースブランチへは cherry-pick する。リリースブランチ上で直接修正しない。**

これは Chromium 等が明文化している運用と同じで、破ると「トランクに入っていない修正」が生まれ、次のリリースで**デグレとして再発**する。この規律を守る限りリリースブランチの乖離は**リリース安定化期間だけに限定**され、常設の `develop` のように無制限に育つことがない——これが `develop` を持たずに「トランクを常にリリース可能に保つ」ことができる理由である。

- リリースブランチは**リリース完了後に破棄**してよい（タグを打っておけば十分）。
- **beam-sync はリリースブランチを自動では扱わない**（人間の運用領域）。本スキルは常にトランクへ向けて PR を積む。

---

## セキュリティ（P0）

- `.env`・APIキー・トークン等の**シークレットを絶対にコミットしない**（step2 の `.gitignore` ＋ step4 の最終ガードの二重防御）。
- 認証情報・トークンを**ログ／PR 本文／コミットメッセージに出力しない**。
- トランクへの直接コミット・履歴改変はしない（PR 経由でのみトランクに反映）。フェーズブランチへの自前 force push もしない（追従は `gh stack sync` に委ねる）。

> **注記**: 本スキルは beam1〜beam5、および power1-4 / power5-phaseN / power6 の完了時に呼ばれることを想定（power は **own モードのみ**。upstream は power6 6-3 の単一クリーン PR）。単独でも `beam-sync {要件名} {phase}` で実行可能。**常設の `develop` は持たない**（トランクベース）。各フェーズは前フェーズのブランチ上で直接作業し、その PR を **GitHub ネイティブの Stacked Pull Requests**（`gh stack link`）として `beam1 → beam2 → beam3 → beam4 → beam5-phase1 → …` の順に積み、`gh stack merge` で**アトミックに**トランクへ取り込む（**マージコミットで取り込む**＝フェーズ履歴を残すためスカッシュしない。ただし merge queue 環境ではマージ方法をキューが決めるため、この既定は保証されない）。ファイルのコピーを行わないため全コミットが本物の祖先関係を持ち、「マージしたのにトランクへ届かない PR」も「レビュー修正が次フェーズで巻き戻る」事故も原理的に発生しない。
>
> **preview 機能への依存**: Stacked Pull Requests は 2026-07-30 時点で public preview であり仕様変更の可能性がある。`gh stack` が使えない場合は step1 で**中断**する（手動スタック運用へはフォールバックしない）。
