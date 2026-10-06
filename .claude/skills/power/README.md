# Power — 既存システムへの機能追加ワークフロー

`power` は、**既存・レガシーのリポジトリに安全に機能追加（やリファクタリング）する**ための段階的ワークフロー（スキル群）です。新規開発の `beam` に対する**ブラウンフィールド（既存改修）版**。短命なブランチ群の上で「準備 → スコープ → 理解 → 設計 → タスク → 実装 → 検証 → PR」を進めます。own リポジトリでは工程ごとに**スタックド PR** を積み、最後に `gh stack merge` で**まとめて1回**マージします（OSS 本家へは機能コードだけの1本のクリーン PR）。

> このファイルは**人間向けのオリエンテーション＋事前準備手順**です。各スキルの実行ロジックは各 `SKILL.md` を参照。

---

## スキル構成（8つ）

| # | スキル | 役割 | 主な出力 |
|---|---|---|---|
| — | `power` | オーケストレーター（停止点を選んで順次実行＋readiness ゲート） | — |
| 0 | `power0-onboard` | 準備（**未整備／レガシーのみ**） | `.devcontainer/` ＋ `CLAUDE.md` ＋ characterization テスト（回帰ネット） |
| 1 | `power1-scope` | スコープ確認 | `feature-requirements.md` ＋ **feature ブランチ作成** |
| 2 | `power2-understand` | 既存理解 | `understanding-brief.md` ＋ `code-map.md`（**全体像＋索引**） |
| 3 | `power3-design` | 変更設計 | `design/`（change-plan 等） |
| 4 | `power4-tasks` | タスク分解 | `tasks.db` / `TASK-*.md` / `overview.md` |
| 5 | `power5-implement` | 実装（工程ごとにコミット） | `src/` ＋ `code-map` 更新 |
| 6 | `power6-verify` | 検証・回帰・PR・再レビュー | `conformance-report.md` ＋ **PR** |

## 全体フロー

```
（事前準備）クローン/fork →（レガシーなら）.claude/skills を repo にコピー → VS Code で開く
   ↓
/power（オーケストレーター）
   ├─ 未整備なら power0-onboard（DevContainer / ビルド / 回帰ネット / CLAUDE.md）
   ├─ power1 scope     … feature/{機能名} ブランチ作成
   ├─ power2 understand… code-map（全体像＋索引）
   ├─ power3 design → power4 tasks → power5 implement（各工程コミット）
   └─ power6 verify    … 回帰検証 ＋ /code-review → スタック最上段の PR → 再レビュー
   ↓
人間が PR をレビューしてマージ（AI は最終承認者ではない）
```

## いつ使う / beam との使い分け

- **新規（ゼロから作る）→ `beam`**（PRD → 要件 → 設計 → タスク → 実装）
- **既存に機能追加・リファクタ → `power`**
- **リファクタリング**の場合: `power1` の要件に **「外部挙動を変えない」不変条件**を明記し、`power0` の characterization テスト ＋ `power6` の回帰ガードで挙動不変を担保する。

---

## 事前準備（power 実行前に1回）

### 前提ツール
- WSL 側: **git** / **gh**（GitHub CLI。**WSL で `gh auth login` 済み**であること——コンテナはこのログインを共有する） / **VS Code ＋ DevContainer** / **WSL bash**
- コンテナ内の道具（Claude Code・gh・gh-stack・sqlite3）は、power0 が入れる**土台（`power-base`）**に含まれる（下記）
- `CLAUDE.md`（build/test/起動コマンド）— 無ければ `power0-onboard` が生成する

### power スキルは repo に同梱する（マウントは使わない）

power はコンテナ内のツールを使うため **Claude Code をコンテナ内で動かす**。Claude Code は **repo 直下の `.claude/skills/` をプロジェクトスキルとして読む**ので、**スキルを repo に置けばマウント不要**（ホストにスキルフォルダが無い PC でも動く）。ワークスペース mount でコンテナにも自動で入る。`~/.claude` はマウントしない（同じ名前のスキルが PC とリポジトリの両方にあると PC 側が使われ、repo 側を最新にしても効かなくなるため）。

### DevContainer の土台（`power-base`）

power4 以降はスタックド PR を作るので、コンテナの中に **gh のログイン・gh-stack** などが要る。これを「**土台**」として1つのフォルダにまとめてあり、power0 がどのリポジトリにも**同じ中身**で入れる（中身は `power0-onboard/templates/power-base/`。DevContainer のローカル feature）。

| 入るもの | 備考 |
|---|---|
| Claude Code（ネイティブ版） | Node を使わないので、Python・Go・Java 等の Node の無いイメージでも入る（公式の claude-code feature は、Node の無いイメージではビルドごと失敗する） |
| GitHub CLI ＋ WSL の gh のログインの共有 | WSL の `~/.config/gh` をマウントして使う。コンテナのユーザー名に左右されない |
| `gh auth setup-git`・gh-stack・git の名前（無いときだけ） | コンテナ起動のたびに整える。失敗しても起動は止めず、起動ログに `[power-base] ⚠️` で直し方を出す |
| sqlite3 | power4 のタスク DB 用 |

- 入れ方は「`.devcontainer/power-base/` をコピーし、`devcontainer.json` に2か所（`features` の `"./power-base": {}` と、`~/.config/gh` を作る `initializeCommand`）足す」だけ。**既存の devcontainer にも同じ手順で足せる**。
- 起動ログに `[power-base] 準備完了` と出れば整っている。WSL で gh にログインしていないと警告が出る（WSL で `gh auth login` → コンテナで `bash /usr/local/share/power-base/setup.sh`。再ビルドは要らない）。
- テンプレートから作った repo は、同等の設定をテンプレートの devcontainer が直接持っているので、power-base は入れない。

**スキルの投入・更新は `/power` が自動でやる**（step1-0）。実行のたびに `.claude/skills/` ＋ `.claude/skills-catalog/` ＋ `docs/rule/ai-security-guardrails.md` を**テンプレートの最新で無条件に上書き**する。

- **鮮度は判定しない**。「持っているか」「新しいか」で分岐せず常に上書きする——正本はテンプレート1つで、派生 repo 側が「より新しい／より正しい」版を持つ筋書きが無いため。条件を作るほど判定漏れの穴ができる（実際「一部だけ古い」で取り残された前例が2件ある）。
- したがって **repo が「スキル無し」「一部だけ」「フルセットだが古い」のどれでも、同じ1手順で最新になる**。
- 取得は private repo 対応のため `gh` を優先。**失敗しても power は止まらない**（警告して今ある物で続行）。
- **削除はしない**ので、repo 独自に足したスキルは消えない（テンプレに無いものは ⚠️ で報告される）。
- 上書きは git 管理下で起きるため、意図しない変更は `git diff` で確認・復元できる。

**手順**:
1. 対象リポジトリをクローンする（fork か private コピー。下の「リポジトリを用意する」参照）。
2. VS Code で開いて `/power`（または `/power0-onboard`）を実行する。**power0 が `.beam/`（ダッシュボード）や `.devcontainer/` を repo にコピー**する。

**テンプレートから作っていないリポジトリには、最初に一度だけ手でスキル一式を入れる**（`/power` 自体がまだそのリポジトリに無いため）。以後は `/power` が起動のたびに自動で最新にする:

```bash
T="$(mktemp -d)"
git clone --depth 1 --filter=blob:none --sparse https://<テンプレートリポジトリ> "$T"
git -C "$T" sparse-checkout set .claude/skills
mkdir -p <対象repo>/.claude && cp -r "$T/.claude/skills" <対象repo>/.claude/
```

> **PC の `~/.claude/skills/` にスキル一式を入れて、そこから `/power` を起動する方法は勧めない。** 同じ名前のスキルが PC とリポジトリの両方にあると、Claude Code は **PC 側を使う**（Claude Code の仕様）。リポジトリ側を最新にしても使われず、PC にコピーした時点の古い版のまま気づかずに動き続ける。PC に置いてよいのは to-prd だけ（テンプレートの README の「方法B」）。
> テンプレートの作り手が自分の PC にスキル一式（正本）を置いているのは、正本そのものが常に最新だからで、利用者がまねる構成ではない。

- `<テンプレートリポジトリ>` は、使っているテンプレートの `ホスト/オーナー/リポジトリ`（例: `github.com/owner/claudecode-template-for-devcontainer`）。テンプレートの `.claude/skills/template.conf` に書かれている `TEMPLATE_REPO` と同じものを指定する。この手順だけはスキルがまだ無い状態で打つので、設定ファイルを読めず手で書く必要がある。

- プロジェクトの `CLAUDE.md` もリポジトリ直下＝ワークスペースなので自動でコンテナ内にある。
- OSS 本家 PR には `.claude/` を入れない（power6 が除外）。own repo ではスキル更新が PR に載るので、**`chore: sync skills from template` の単独コミット**に分けて機能差分と混ぜない。

### タスクダッシュボード（任意）

`data/tasks.db` の状況をブラウザで見たいとき、`power0-onboard` がテンプレの `.beam/dashboard/`（Node22 の自己完結アプリ）を repo にコピーし、devcontainer に Node feature ＋ ポート 3939 を追加する。

- **view モード**（Notion 不要・読取専用）で `http://localhost:3939/` に一覧表示。power4 が `data/tasks.db` を作るまでは空一覧（正常）。power の tasks.db は **beam4 互換スキーマ**なのでそのまま表示される。
- **プロジェクトが Node でなくても** devcontainer features は共存するので Node を併載できる（コンテナはやや重くなる）。
- **`.beam/` は `.git/info/exclude` に入れる**（あなたのツールであり repo 本体・PR に混ぜない。**OSS 貢献では PR を汚さないため必須**）。

### リポジトリを用意する（★重要）

power は **`origin` に push して PR を作る**ため、`origin` は **自分が push 権限を持つリポジトリ**である必要があります。OSS 本家（upstream）には push できないので、**fork するか、自分のコピーを作る**ところから始めます。

**ケースA：変更を OSS 本家に貢献する（upstream に PR）→ public fork**
```bash
gh repo fork <owner>/<repo> --clone   # fork＋クローン＋upstream 自動設定
```
- upstream との紐づけは残す（PR で戻すため）。fork は **public** になる点に注意。
- **PR のクリーンさ**: `power6` が本家 PR 時に power の生成物（`docs/spec`・`docs/tasks`・`code-map`・`.beam`・`.devcontainer`・`CLAUDE.md` 等）を **PR から除外**し、**機能コードの差分だけ**を送る（work ブランチには全部残る）。モード判定は `gh repo view --json parent`（parent あり＝upstream モード）。

**ケースB：自分の非公開コピー／独自版として持つ（private・推奨されることが多い）**
```bash
git clone <upstream-url> <name> && cd <name>
git remote rename origin upstream                          # 元 origin を upstream に改名（消さない）
gh repo create <you>/<name> --private --source=. --remote=origin --push
# 結果: origin = 自分の private リポジトリ / upstream = OSS 本家
```
- 本家の更新を後で取り込む: `git fetch upstream && git merge upstream/main`
- 全ブランチ・タグも複製するなら `git push --mirror origin`
- 完全に切り離したい場合のみ `git remote remove origin`（ただし更新を追えなくなるので **upstream は残す方を推奨**）

**共通の後処理**
```bash
code <path>   # VS Code でクローンしたフォルダを開く → 以降 /power（または /power0-onboard）
```

### OSS のライセンス遵守（法的助言ではなく一般的注意）
- `LICENSE`・著作権表示・`NOTICE` は**残す**。
- **コピーレフト（GPL/AGPL 等）** は派生物にも同ライセンス公開義務があり得る（private でも配布・公開時に影響）。
- 作業・公開の前に**ライセンス種別を確認**する。

---

## 使い方

- **`/power`**（推奨）… 停止点を選んで一括／分割実行。未整備リポジトリは readiness ゲートが `power0-onboard` を案内。
- **個別実行**… `/power0-onboard`、`/power1-scope` … `/power6-verify` を単独でも回せる。
- 各スキルの詳細は各ディレクトリの `SKILL.md` を参照。

## 仕様が変わったら — `/revise`（beam/power 共通の横断スキル）

開発途中・完了後を問わず、**確定済みの仕様・設計を変更する**ときは `/revise` を使う（変更の再入口）。

- 入口は2つ: `/revise REQ-05 …変更内容…`（**意図先行・推奨**）／手編集後に `/revise`（git diff から検出）
- 影響は既存成果物（カバレッジ行列・conformance・TASK の要件リンク・change-plan・code-map）から **ID レベルで導出**し、🔵🟡🔴（=「影響あり」という判断の確からしさ）で提示 → 承認 → 上流更新 → 下流の部分再生成 → **影響タスクを再キュー**（`update_badge=1` でダッシュボードに「更新あり」表示）
- 再実装は beam5/power5、再検証はゲートが担当（revise は整合回復まで）。改定記録は `docs/revisions/` に残る
- beam5/power5/power6 は「上流だけ新しい」drift を検知すると `/revise` を促す（自動検知・手動実行）

## 設計メモ（背景）

- **beam は無改変**で再利用（`tdd-implement` / `direct-implement` / `estimate-storypoint` など、引数で要件名を取る下位部品のみ利用。`beam3/4/5` ディスパッチャは `要件名=pwd` 衝突のため呼ばない）。
- **code-map = 全体像（アーキテクチャ地図）＋ beam5 互換の索引**（索引だけでは全体理解に不足するため）。
- **レビューの終了条件 = CRITICAL/HIGH ゼロ**（指摘ゼロではない。最大2ラウンド、残る LOW/MEDIUM は既知・許容）。
- **フォルダ規約**: テンプレのみ→`templates/`、他の参照ファイルも入る→`references/`（この README は人間向けオリエンテーションなのでフォルダ直下）。
