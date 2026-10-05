---
name: power
description: 既存システムへの機能追加ワークフロー（power シリーズ）のオーケストレーター。「power を実行」「機能追加を始めたい」「既存システムに機能を足す」「power ワークフロー」という場面で使用してください。停止点を確認し、Skill ツールで power1（スコープ確認）→ power2（既存理解）→ power3（変更設計）→ power4（タスク分解）→ power5（実装）→ power6（検証・PR）を、選択した停止点までメインコンテキストで順に実行します。各フェーズは AskUserQuestion による対話を行うためサブエージェントではなくメインで実行します（重い処理は各フェーズが内部でサブエージェントに委譲）。新規開発の beam に対するブラウンフィールド（既存改修）版で、feature/{機能名} ブランチ上で作業します。
allowed-tools: AskUserQuestion, Skill, Task, Read, Glob, Bash, TodoWrite
argument-hint: "[機能名（任意・再開時）]"
---

あなたは power シリーズ（既存システムへの機能追加ワークフロー）のオーケストレーターです。各フェーズを **Skill ツールでメインコンテキストで順次実行**します。新規開発の `beam` に対する**ブラウンフィールド（既存改修）版**です。

> **重要（対話の制約）**: power1〜6 は AskUserQuestion による対話を含みます。サブエージェント（Task）内では AskUserQuestion がユーザーに届かないため、**各フェーズはサブエージェントで包まず、メインで `Skill` 実行**します。重い処理（コード探索・並列ファイル生成・フェーズ実装）は各フェーズスキルが内部でサブエージェントに委譲します。

# context
- 対象リポジトリ: `pwd` の basename（機能を追加する**既存システム**）
- 機能名: `{機能名}`（power1 が確定。再開時は既存 `docs/spec` から検出）
- ブランチ: `feature/{機能名}`（power1 が作成。power1〜4 がこの上に逐次コミットし、power5 以降は `power5-phaseN-{機能名}` → `power6-{機能名}` と積み上げる）

# power フェーズ一覧

| 順序 | スキル | 役割 | 主な出力 |
|---|---|---|---|
| 0 | `power0-onboard` | 準備（**未整備リポジトリのみ**） | `.devcontainer/` ＋ `CLAUDE.md` ＋ characterization テスト（回帰ネット） |
| 1 | `power1-scope` | スコープ確認 | `feature-requirements.md` ＋ **feature ブランチ作成** |
| 2 | `power2-understand` | 既存理解 | `understanding-brief.md` ＋ `code-map.md`（**Mermaid の図＋機械検証済みの `file:line` 根拠**） |
| 3 | `power3-design` | 変更設計 | `design/`（change-plan 等） |
| 4 | `power4-tasks` | タスク分解 | `tasks.db` / `TASK-*.md` / `overview.md` |
| 5 | `power5-implement` | 実装 | `src/` ＋ `code-map` 更新 |
| 6 | `power6-verify` | 検証・PR | `conformance-report.md` ＋ **PR ＋ 再レビュー** |

各フェーズは前フェーズの成果物を入力とする。

**スキル存在チェック**: power0〜6 はインストール済み前提。各フェーズ実行前にスキルの存在を確認し（**解決順: リポジトリ直下 `.claude/skills/` → `~/.claude/skills/`**。repo 同梱が基本）、**無い場合のみ**スキップして警告する。なお同梱スキルの**鮮度**は step1-0 が担保する（存在チェックは有無しか見ないため、それだけでは「フルセットだが古い」を素通りしてしまう）。

---

# ブランチ戦略（beam と共通）

power も beam と同じ **Trunk-Based Development ＋ 必要時リリースブランチ** を採る。

- **トランクは1本だけ**（リポジトリの既定ブランチ）。**常設の統合ブランチ（`develop`）は持たない。** ブランチ名は決め打ちせず `gh repo view --json defaultBranchRef` で解決する（取得できなければ `main`）。
- 機能追加は**短命なブランチ群**で行い、**1機能＝1マージ単位**としてトランクへ落とす。**「1機能＝1 PR」ではない**——PR は工程ごとに分かれるが、マージは1回である。
- **own モード: フェーズごとのスタックド PR**（`gh stack`）。

  ```
  $TRUNK
   └ feature/{機能名}           ← power1〜4（ドキュメント）★人間のレビュー地点
      └ power5-phase1-{機能名}  ← 実装 Phase 1（フェーズ単位でレビュー済み）
         └ power5-phase2-{機能名}
            └ power6-{機能名}   ← 検証・要件適合・統合レビュー
  ```

  - Git 連携は **`beam-sync`**（名前は beam- だが **beam / power 共通**。スタック機構を二重に持つとドリフトするため1本に集約している）。power4 が `power1-4`、power5 が各 `power5-phaseN`、power6 が `power6` を渡す。
  - **トランクを常にリリース可能に保つ**: `gh stack merge` は **all-or-nothing** なので、スタック全体が1回のマージで入る。トランクが「機能が半分だけ入った状態」を経由しない。
  - **`feature/{機能名}`（power1-4 層）を単独でマージしない。** ドキュメントのみなのでトランクは壊れないが、**レビュー地点であってマージ地点ではない**。先に落とすと1マージ単位の性質が失われる。
  - **フェーズが1つの機能なら自然に3段**（feature → phase1 → power6）になる。段数は power4 が決めたフェーズ数で決まる。
- **upstream（OSS 本家）モード: スタックを使わず1本のクリーン PR。** 本家メンテナに要件定義書・理解ブリーフ・タスク分解を段階的に送る選択肢は無いため、power6 の 6-3 が process 生成物を除いた**機能コードだけの `pr/{機能名}`** を作る。
- **リリースブランチは必要になったときだけ**トランクから切る（「リリースを凍結したままトランクを進めたい」場合のみ）。守る規律は1つ——**修正は必ずトランクで行い、リリースブランチへは cherry-pick する。リリースブランチ上で直接修正しない。**
- **beam との違いは「まとめ方」だけ**: beam は要件1つを `beam1 → … → beam5-phaseN` のスタックに、power は機能1つを `power1-4 → power5-phaseN → power6` のスタックにする。**トランクベース・常設 develop なし・`gh stack merge` によるアトミックなマージ**はまったく共通で、Git 連携スキルも同じ `beam-sync` を使う。違うのはフェーズ名と、PR 本文に載せる要約項目だけである。

---

## step1: 前提確認とエントリ判定

- `pwd` で対象リポジトリ名を把握する（＝機能を追加する既存システム）。実コードがある前提（無い＝新規開発なら `beam` を勧める）。

### 1-0. 同梱スキルの更新（★最初に必ず実行）

repo 同梱のスキルは**放っておくと古くなり、しかも古いことに誰も気づけない**（バージョンの概念が無いため）。毎回テンプレートの最新で上書きする:

```bash
# スクリプトは「このスキルの置き場所」から辿る（作業ディレクトリや $HOME を基準にしない）
B='<このスキルのベースディレクトリ>'   # Claude Code が「Base directory for this skill」で示す値をそのまま入れる
B="$(printf '%s' "$B" | tr '\134' '/')"                    # \ を / に揃える（\134 はバックスラッシュ）
if command -v wslpath >/dev/null 2>&1; then                # WSL の bash のときだけ変換する
  case "$B" in
    //wsl.localhost/*/*|//wsl[$]/*/*) B="/${B#//*/*/}" ;;   # \\wsl.localhost\<distro>\x → /x
    [A-Za-z]:/*) B="$(wslpath -u "$B")" ;;                  # C:\x → /mnt/c/x
  esac
fi
bash "$B/../skills-update/scripts/refresh-skills-from-template.sh"
```

- **パスはスキルの置き場所から辿る。** 相対パス（`.claude/skills/...`）だと、作業ディレクトリがずれた時点でコンテナの中でも外れる。`$HOME/.claude` も使わない——コンテナには `~/.claude` がマウントされておらず、Windows の Claude Code から WSL の bash を呼ぶと `$HOME` は空の別ディレクトリを指す。ベースディレクトリは Windows 形式（`C:\...`）や UNC 形式（`\\wsl.localhost\...`）で示されることがあるので、上のブロックで実行するシェルに合わせて変換する（Git Bash とコンテナはそのまま通る）。
- **「持っているか／新しいか」を判定しない。常に上書きする。** 正本はテンプレート1つで、派生 repo 側が「より新しい／より正しい」版を持つ筋書きが存在しないため。条件分岐を増やすほど判定漏れの穴ができる。
- 対象は `.claude/skills/` ＋ `.claude/skills-catalog/` ＋ `docs/rule/ai-security-guardrails.md`（派生コピーを外すと「ここだけ古い」が再発する）。
- **取得に失敗しても止めない**（exit 2 = fail-open）。テンプレは private なので `gh` 認証が要る。警告を出し、**いま repo にあるもので続行**する。
- **削除はしない**。テンプレに無いファイルは ⚠️ で報告するだけ（repo 独自のスキルを消さないため）。
- **出力に「★ power/SKILL.md 自身が更新されました」が出た場合**は、その旨をユーザーに伝える。実行中のオーケストレーターは起動時に読んだ古い指示のまま動く（後続の power1〜6 は `Skill()` 呼び出し時に新版が読まれる）。**指示自体を最新にしたいかをユーザーに確認**し、望むなら中断して `/power` の再実行を案内する。
- **更新があった場合のコミット**: トランクには直接コミットしない。**feature ブランチができた時点**で `chore: sync skills from template` として**単独コミット**する（機能差分に混ぜない。power1 未実行ならブランチ作成後にコミットする）。upstream モードでは `.claude/` を PR から除外済みなので影響しない。
- **スキルが1つも無い repo でも、ホストで `/power` を起動すれば、ユーザーのスキル置き場にある power が動き、この手順で一式が入る**（スクリプトを power 自身の置き場所から辿るので、シェルが WSL でも Git Bash でも同じように動く）。コンテナ内で `~/.claude` も repo 同梱も両方無い場合だけは物理的に不可能なので、`power/README.md` の手動 bootstrap を案内する。

### 1-1. 準備度チェックと既存進捗の検出

- **準備度チェック（readiness ゲート）**: リポジトリが power で作業できる状態かを確認する — ① git 管理下か ② `CLAUDE.md` にコマンド表（build/test/起動）があるか ③（分かれば）build/test が通るか ④ `.devcontainer` の有無 ⑤ 挙動ベースライン（characterization テスト）の有無。**未整備なら、先に `Skill({ skill: "power0-onboard" })` を案内・実行**して「動く・測れる・コマンドが分かる・回帰ネットがある」状態にしてから power1 へ進む（特に**ドキュメントの無いレガシー／リファクタ用途**で重要。power0 は 2 ステージ・再開可能で、途中で「Reopen in Container→再実行」の人間ハンドオフが入る）。準備済みなら次へ。
- **既存進捗の検出**: `docs/spec/*/feature-requirements.md` / `understanding-brief.md` / `design/` / `docs/tasks/*/` / `conformance-report.md` を Glob で確認する。
  - 何も無い → **新規開始**（power1 から。`{機能名}` は power1 が決める）。
  - 既存あり（＝過去に機能を追加した repo。**2つ目以降**）→ 検出した機能一覧と各進捗を表示し、AskUserQuestion で **「新しい機能を追加する（新規 power1 から）」／「進行中の機能を再開する（機能とフェーズを選択）」** を確認する。新規なら power1 が新しい `{機能名}` とブランチを作る（**power1 が分岐前に default を最新化**するので、マージ済みの過去機能の上に積める）。

## step2: 停止点の選択

AskUserQuestion でどこまで実行するか確認する:

- `power1`（スコープ確認）まで
- `power2`（既存理解）まで
- `power3`（変更設計）まで
- **`power4`（タスク分解）まで（推奨）** — ここで成果物をレビューしてから実装に進むのが安全
- `power5`（実装）まで
- `power6`（検証・PR）まで（最後まで一気に）

> **推奨運用**: タスク分解（power4）まで実行 → **power4 が作った `power1-4` の PR をレビュー** → **`/clear`（新セッション）でコンテキストをリセットしてから** `power5`/`power6` を実行する（実装・検証は重いフェーズで、ファイルから状態を読み直すため会話履歴は不要）。一気に通したい場合は `power6` まで選択可。
>
> **レビューはまず `docs/code-map.md` の図から見る**（構成／主要フロー／データの流れ）。散文よりも、**AI がシステムをどう理解したかの誤解が最短で見つかる**。図が実態と違えば、その先の設計・タスクも同じ誤解の上に乗っている。**GitHub は PR の差分で Mermaid をレンダリングする**ので、ブラウザで図を見て該当行にコメントできる。
>
> **その PR は単独でマージしない**（レビュー地点であってマージ地点ではない）。マージはスタック全体を `gh stack merge` で一度に行う。

選択を `{停止点}` として対象フェーズを確定する。

## step3: 実行計画の確認

- 対象フェーズ一覧を表示する。スキル存在チェックを行う（無いフェーズは `⏭️ スキップ` 表示）。
- AskUserQuestion で実行可否（「実行する」「中止」）を確認する。

## step4: 各フェーズの実行（メインで Skill 直接呼び出し）

`{停止点}` までのフェーズを、メインで `Skill` により順に実行する:

1. **power1-scope** → `Skill({ skill: "power1-scope", args: "{機能の説明 or 空}" })`
   - **power1 の引数は「機能の説明・元ドキュメント（素材）」であり、機能名ではない**。新規開始時は空（またはユーザーの機能説明）で呼ぶ（power1 が機能名を決め、`feature/{機能名}` を作成する）。
   - **既存機能の再開で power1 を再実行しない**（再開は power2 以降から。確定済み仕様の変更は `/revise` の領分）。
   - **power1 完了後、`{機能名}` を確定する**（新規作成された `docs/spec/*/feature-requirements.md`、または power1 の報告から取得）。以降のフェーズにこの `{機能名}` を渡す。
2. **power2-understand** → `Skill({ skill: "power2-understand", args: "{機能名}" })`
3. **power3-design** → `Skill({ skill: "power3-design", args: "{機能名}" })`
4. **power4-tasks** → `Skill({ skill: "power4-tasks", args: "{機能名}" })`
5. **power5-implement** → `Skill({ skill: "power5-implement", args: "{機能名}" })`（停止点が power5 以上の場合）
6. **power6-verify** → `Skill({ skill: "power6-verify", args: "{機能名}" })`（停止点が power6 の場合）

- 各フェーズ完了後、成果サマリー（作成ファイル・信頼性レベル分布など）を簡潔に表示してから次へ進む。
- **TodoWrite** で各フェーズの進捗を更新する（「powerN 実行中」→「completed」）。
- **エラー・中断時**: 内容を表示し、AskUserQuestion で「再試行／次フェーズへ／中止」を確認する。
- **power5/power6 を含む場合**: 重いフェーズである旨を伝え、コンテキストが大きくなりそうなら分割実行（別セッション）を勧める。

## step5: 完了報告

- 実行したフェーズと成果物（feature-requirements / understanding-brief / code-map / design / tasks / src / conformance-report）を集約表示する。
- **feature ブランチ名**、（power6 まで実行した場合）**PR の URL** を表示する。
- 停止点別の次アクション:
  - **power4 で止めた場合**: 成果物をレビュー → `/clear` 後に `/power5-implement`（または `/power` を power6 まで再実行）。
  - **power6 まで実行した場合**: **PR を人間がレビューしてマージ**する。

> **AI 生成コードは人間がレビューし、最終責任を持つ。AI は最終承認者ではない。**

---

## 環境前提
- 既存リポジトリ内で実行する。WSL の bash 推奨（Windows から実行する場合は `wsl bash -c "..."`）。
- 各フェーズスキル（power0〜6）がインストール済みであること。
- **システム概要・事前準備（クローン / fork / OSS・ライセンス / 前提ツール）は同ディレクトリの `README.md` を参照。**

## スクリプト

| スクリプト | 内容 |
|---|---|
| `skills-update/scripts/refresh-skills-from-template.sh` | 同梱スキルをテンプレートの最新で**無条件に上書き**する（鮮度を判定しないのは、正本が1つで派生側が新しい版を持つ筋書きが無いため）。取得失敗は fail-open（exit 2）、削除はしない。**実装は `skills-update` スキルに置き、power は step1-0 でそれを呼ぶ**（1本に集約）。単独で更新したいときは `/skills-update`。 |
