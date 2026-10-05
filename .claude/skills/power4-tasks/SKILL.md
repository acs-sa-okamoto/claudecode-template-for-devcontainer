---
name: power4-tasks
description: 機能追加の変更をタスクに分解し、ストーリーポイントで見積もって tasks.db に登録するスキル（power ワークフローの工程4）。power3 の design（change-plan 含む）と feature-requirements・understanding-brief を入力に、実装タスクと回帰検証タスクを洗い出し、estimate-storypoint で見積もり、beam4 と同一スキーマの tasks.db（テーブル名={機能名}）と TASK-*.md・overview.md を生成します。「タスク分解」「power4」という場面で使用してください。beam4-tasks ディスパッチャは呼びません（要件名=pwd 衝突回避）が、tasks.db スキーマと estimate-storypoint は再利用します。要件カバレッジ＋回帰カバレッジのゲートを通します。
allowed-tools: Read, Glob, Grep, Task, Write, Edit, AskUserQuestion, Bash, Skill, TodoWrite
argument-hint: "[機能名 / 空（docs/spec から自動検出）]"
---

あなたは機能追加の変更を実装タスクに分解し、ストーリーポイントで見積もるエンジニアです。`要件名=pwd` の衝突を避けるため **beam4-tasks ディスパッチャは呼ばず**、**tasks.db スキーマと `estimate-storypoint` は再利用**して **feature スコープ** でタスクを生成します。

これは **power ワークフローの工程4（タスク分解）**。出力タスクは後続の `power5-implement` が `tdd-implement`/`direct-implement` に渡して実装します。**TASK ファイルは自己完結**させ（統合契約・踏襲規約を埋め込む）、実装エンジンが追加コンテキスト無しで実装できるようにします。

# context
- 機能名: `{機能名}`（引数 or 自動検出）
- 入力: `docs/spec/{機能名}/design/`（change-plan.md ほか）/ `feature-requirements.md` / `understanding-brief.md` / `docs/code-map.md`
- 出力: `docs/tasks/{機能名}/overview.md` / `TASK-*.md` / `data/tasks.db`（テーブル名=`{機能名}`）

---

## step1: 入力の読み込み
- `{機能名}` を確定（引数。無ければ Glob、複数なら AskUserQuestion）。
- `design/change-plan.md`（触るファイル一覧）・他の design 文書・`feature-requirements.md`・`understanding-brief.md`・`docs/code-map.md` を読む。
- `CLAUDE.md` / `docs/rule/ai-security-guardrails.md` を読む。
- 既存 `docs/tasks/{機能名}/TASK-*.md` があれば番号を確認（重複回避）。
- **Git ブランチの確保**（git 管理下の場合）: 作業は `feature/{機能名}` ブランチ上で行う。未作成ならデフォルトブランチを基点に作成、既存ならチェックアウト。非 git／git 不在ならスキップ。

## step2: タスク粒度の確認（簡潔に）
- AskUserQuestion で粒度（1タスクの SP 上限：標準=最大5SP / 細かめ=最大3SP）を確認する。

## step3: タスクの洗い出しと見積もり
- **実装タスク**: change-plan の「触るファイル一覧」を基に、新規/改修を独立実装可能な単位に分解する。TDD（ロジック・UI・テスト）/ DIRECT（環境・設定・マイグレーション）を分類。
- **回帰検証タスク**: understanding-brief の **REG（回帰リスク）ごとに検証タスク**を立てる（既存を壊さない確認。多くは TDD のテスト追加）。
- 依存関係を分析（既存への接続順・前提）。
- **`estimate-storypoint` を Skill で呼び**、各タスクの `story_point`/`buffer_percent`/`complexity`/`reason` を得る（全タスクまとめて渡す）。SP 13.1 以上は分割、buffer 51% 以上は 🔴 として overview に「要再確認」。

## step4: TASK-*.md の作成（自己完結させる）
- 出力先 `docs/tasks/{機能名}/`（無ければ `mkdir -p`）。**beam4 のタスクテンプレ形式を踏襲**（beam4-tasks のテンプレートは**リポジトリ直下 `.claude/skills/beam4-tasks/templates/` → 無ければ `~/.claude/skills/beam4-tasks/templates/`** の順で解決して読む）。
- 各 TASK に: task_id（`TASK-XXXX`）・タイプ（TDD/DIRECT）・**カバーする FR/NFR/AC ID**・依存・実装詳細・テスト要件・SP・信頼性レベル。
- **★自己完結化**: understanding-brief の **該当する INT（接続先の実シグネチャ）と踏襲規約**を、各 TASK の実装詳細に**埋め込む**（実装エンジンが TASK ファイルだけで正しく統合できるように）。
- **列挙を含む要件は項目単位で明記**（「N項目表示」なら全項目を列挙）。

## step5: tasks.db への書き込み
- **beam4 と完全に同一のスキーマ・手順**で書き込む（テーブル名=`{機能名}`）。**beam4-tasks の SKILL.md の step4.7 を読み**（解決順: リポジトリ直下 `.claude/skills/beam4-tasks/SKILL.md` → `~/.claude/skills/beam4-tasks/SKILL.md`）、**その CREATE TABLE / インデックス / トリガー / `_projects` / UPSERT をそのまま適用**する（要件名の箇所を `{機能名}` に置換）。
  - これにより `power5-implement`（= tdd/direct-implement）・既存のダッシュボード・Notion 同期がそのまま動く（スキーマ互換が必須）。
- **`content` 列は「タスク概要」＝ 1〜3文・200字以内の要約**にする。**TASK-*.md の本文や全文を入れない／空（NULL）にもしない。**
  - TASK-*.md の `## タスク概要` を 1〜3文に圧縮した地の文（Markdown 記法なし）。詳細ルールと良い例／悪い例は beam4-tasks SKILL.md の 4.7.4「書き込みルール」。
  - **なぜ**: この列はダッシュボード（TaskBridge）の「内容」列と Notion 同期の本文に**そのまま・切り詰めなしで**描画される。全文や空を入れると一覧が読めなくなる。さらに Notion 同期は `content` を分割せずに送るので、全文（2,000字超）の行は**同期自体が失敗する**。
- **スキーマ初期化（CREATE TABLE / インデックス2本 / `updated_at` トリガー）は1つも省略しない。** トリガーが欠けると、そのプロジェクトだけ更新日時が自動追従しなくなる（ダッシュボードで気づきにくい）。
- `sqlite3` が無ければ DB 書き込みをスキップし、その旨を報告（TASK-*.md と overview で後続は進められる）。

## step6: カバレッジゲート（必須）
- **要件カバレッジ**: `feature-requirements.md` の **全 FR/NFR/AC** に対応タスクがあるか照合。✅カバー / 🟢タスク不要（理由必須）/ ❌未カバー。
- **回帰カバレッジ**: understanding-brief の **全 REG** に検証タスクがあるか照合。
- **❌ が 1 件でもあれば step7 に進まない**。step3 に戻ってタスク追加、または AskUserQuestion で要件を 🟢（理由付き）にする。
- 結果を overview の「カバレッジ」セクションに記録。

## step7: overview と完了報告
- `docs/tasks/{機能名}/overview.md` を作成（beam4-tasks の overview テンプレート形式を踏襲。解決順: リポジトリ直下 `.claude/skills/beam4-tasks/templates/` → `~/.claude/skills/beam4-tasks/templates/`）。フェーズ構成・依存・カバレッジ行列を記載。
- **Git コミット**（feature ブランチ上の場合）: `docs/tasks/{機能名}/`（`TASK-*.md`・`overview.md`）を `git add` → `git commit -m "power4: tasks"`。**`data/tasks.db` は `.gitignore` 対象なのでコミットしない**。git 管理外ならスキップ。
- **Git 連携（★power1〜4 をここで1つの PR にする）**（own モードのみ）: `Skill(skill="beam-sync", args="{機能名} power1-4")` を実行する。power1〜4 の成果（feature-requirements / understanding-brief / design / tasks / code-map）が載った `feature/{機能名}` ブランチを push し、**スタック最下段の PR** を作る。
  - **この PR が人間のレビュー地点**である。power2 が描いた code-map の Mermaid 図は GitHub の差分表示でレンダリングされるので、**AI の理解が正しいかを図で確認し、必要なら行単位でコメントする**。
  - **この PR を単独でマージしない。** ドキュメントのみなのでトランクは壊れないが、先に落とすと「1機能＝1マージ単位」が崩れ、要件だけ入って実装が無い状態がトランクを通過する。**レビュー地点であってマージ地点ではない。**
  - upstream（OSS 本家）モードではスキップする（power6 の 6-3 が機能コードだけの単一クリーン PR を作るため）。`gh` 未認証等で beam-sync が中断したら、その案内を伝えて続行する。
- 完了報告: タスク総数・合計SP・フェーズ数、カバレッジ結果（FR/NFR/AC・REG）、信頼性分布、**作成した power1-4 PR の URL**。
- 次工程: **`power5-implement`**（実装）。`power` 経由なら自動で次へ。**推奨は、ここで一度止めて PR をレビューしてから power5 に入ること。**

---

## 環境前提
- 既存リポジトリ内で実行。WSL bash 推奨。`sqlite3` があれば tasks.db を生成（無ければスキップ）。

## 参照
- tasks.db スキーマ・タスク/overview テンプレートは **beam4-tasks のものを正とする**（解決順: リポジトリ直下 `.claude/skills/beam4-tasks/` → `~/.claude/skills/beam4-tasks/`）。estimate-storypoint を Skill で再利用する。
