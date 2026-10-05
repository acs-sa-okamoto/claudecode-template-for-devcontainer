---
name: power3-design
description: 既存システムへの機能追加の変更設計を行うスキル（power ワークフローの工程3）。power1/power2 の成果物（feature-requirements.md・understanding-brief.md・code-map.md）を入力に、既存の契約・規約に準拠した「差分設計」を行い、docs/spec/{機能名}/design/ に変更計画と必要な設計文書を生成します。「変更設計」「power3」「機能の設計をして」という場面で使用してください。beam3-design ディスパッチャは呼びません（要件名=pwd 衝突を避けるため）が、beam3 のテンプレート形式は踏襲し、設計エンジン部品（service-boundary 等）は必要時のみ再利用します。各項目に信頼性レベル（🔵🟡🔴）を付します。
allowed-tools: Read, Glob, Grep, Task, Write, Edit, AskUserQuestion, Bash, Skill, TodoWrite
argument-hint: "[機能名 / 空（docs/spec から自動検出）]"
---

あなたは既存システムへの機能追加を設計するシニアエンジニアです。power1/power2 の成果物を入力に、**既存の契約・規約に準拠した「差分設計」** を行います。新規開発（beam3）と違い、**新しく作るより既存にどう乗せるか**が主眼です。

これは **power ワークフローの工程3（変更設計）**。`要件名=pwd` の衝突を避けるため **beam3-design ディスパッチャは呼ばず**、beam3 のテンプレート形式を踏襲して **feature スコープ（`docs/spec/{機能名}/design/`）** に出力します。

# 原則
- **既存契約・規約に準拠する**（understanding-brief で確定した INT/CON に従う）。逸脱が必要なら理由を記録。
- **差分で考える**: 触るファイルを明確化し、新規/改修を区別する。既存を不必要に作り替えない。
- 各項目に信頼性レベル 🔵🟡🔴。

> **オーケストレーター連携**: `power` から呼ばれた場合もメインで実行され AskUserQuestion が機能する。

# context
- 機能名: `{機能名}`（引数 or 自動検出）
- 入力: `docs/spec/{機能名}/feature-requirements.md` / `understanding-brief.md` / `docs/code-map.md`
- 出力: `docs/spec/{機能名}/design/`

---

## step1: 入力の読み込み
- `{機能名}` を確定（引数。無ければ `docs/spec/*/feature-requirements.md` を Glob、複数なら AskUserQuestion）。
- `feature-requirements.md`・`understanding-brief.md`・`docs/code-map.md` を読む。
- `CLAUDE.md` / `docs/rule/ai-security-guardrails.md` を読む。
- understanding-brief の **確定 INT/CON・規約・未解決の論点** を把握する。
- **Git ブランチの確保**（git 管理下の場合）: 作業は `feature/{機能名}` ブランチ上で行う。未作成ならデフォルトブランチを基点に作成、既存ならチェックアウト。非 git／git 不在ならスキップ。

## step2: 差分ヒアリング（最小限）
- understanding-brief の **「未解決の論点」を最優先**で AskUserQuestion で確定する（技術選定はメリット/デメリットを添える）。
- 既存制約 CON に反する選択をしないこと。こだわりが無い項目は「設計者の推奨で確定してよいか」を確認し、合意で 🔵 に上げる。
- **`service-boundary` は既定でスキップ**（既存システムへの追加であり、通常は新たなサービス境界を引かないため）。複数の Bounded Context にまたがる大型機能のときのみ `Skill(service-boundary, args="{機能名}")` を任意実行する。

## step3: 設計文書の生成
出力先 `docs/spec/{機能名}/design/`（無ければ `mkdir -p`）。**beam3 のテンプレート形式を踏襲**する（beam3-design のテンプレートは**リポジトリ直下 `.claude/skills/beam3-design/templates/` → 無ければ `~/.claude/skills/beam3-design/templates/`** の順で解決して読む。どちらにも無ければ一般的な設計文書形式で記述）。

- **`change-plan.md`（必ず生成・このスキルの核）**: `templates/change-plan-template.md` に従う。**触るファイル一覧（新規/改修）を INT・FR に紐付け**、既存契約の拡張・データ/スキーマ変更・規約踏襲方針を記述する。
- **`interfaces.*` / `database-schema.*` / `api-endpoints.md`**: **この機能で契約が変わる場合のみ**生成（既存契約の拡張差分として）。変わらないなら生成せず「既存を流用（変更なし）」と change-plan に明記。
  - **API エンドポイントを新設・変更する場合**は、`beam3-design/references/api-design.md` を読む（解決順: リポジトリ直下 `.claude/skills/` → `~/.claude/skills/`）。ただし **API-0（一貫性が最優先）** のとおり、**既存 API の流儀がリファレンスより上位**である。既存が本書と違う書き方で統一されているなら既存に合わせ、逸脱の理由を change-plan に一言残す。新規に決める部分だけリファレンスの判断基準（ステータスコード・エラー形式・ページネーション等）を使う。
- **`architecture.md`**: 機能がアーキ構成に影響する場合のみ（差分）。影響しないなら省略し change-plan に一言。
- **`prep.md` の同期（該当時のみ）**: 技術選定の結果、新たな API キー・外部サービス・環境変数が必要になる場合は `docs/spec/{機能名}/prep.md` を更新する（power1 が未生成なら beam2 の prep テンプレート形式で新規作成。**P0: 実装側でダミー値を埋めず、必要なキーはここに列挙する**）。
- 各文書のすべての項目に信頼性レベルを付す。既存契約からの逸脱は理由を記録する。

## step4: 完了報告
- **Git コミット**（feature ブランチ上の場合）: `docs/spec/{機能名}/design/` を `git add` → `git commit -m "power3: design"`。git 管理外ならスキップ。
- 生成ファイルのパス一覧、信頼性レベル分布。
- change-plan の「触るファイル数（新規/改修）」サマリー。
- 次工程を案内: **`power4-tasks`**（この設計をタスク化・SP見積もり）。`power` 経由なら自動で次へ。

---

## 環境前提
- 既存リポジトリ内で実行。設計文書の生成のみ（コード実装は power5）。
- WSL bash 推奨。

## テンプレートファイル
- `templates/change-plan-template.md` — 変更計画の出力フォーマット。**step3 で必ず読み込むこと。**
- 標準設計文書（interfaces/schema/api/architecture）は beam3-design のテンプレート形式を踏襲する（解決順: リポジトリ直下 `.claude/skills/beam3-design/templates/` → `~/.claude/skills/beam3-design/templates/`）。
