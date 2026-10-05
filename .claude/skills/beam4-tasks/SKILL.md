---
name: beam4-tasks
description: 設計文書に基づいて実装タスクを分割し、各タスクをストーリーポイントで見積もって、1スプリント（10日想定）以内の規模でフェーズに整理します。各タスクを個別ファイルで管理し、依存関係を考慮した適切な順序で管理します。
allowed-tools: Read, Glob, Grep, Task, Write, Edit, TodoWrite, AskUserQuestion, Bash, Skill, TaskCreate, TaskUpdate, TaskList
argument-hint: "[work_scope] [scope-options=on|off]"
---

## 目的

設計文書に基づいて実装タスクを分割し、各タスクをストーリーポイント（相対的な実装規模・複雑性）で見積もる。タスクは1スプリント（10日想定）以内の規模でフェーズに整理し、各タスクを個別ファイルで作成して、依存関係を考慮した適切な順序で管理する。

## 前提条件

- `docs/spec/{要件名}/design/` に設計文書が存在する（beam3-design の成果物）
- 設計がユーザによって承認されている（または承認が省略されている）
- `docs/tasks/{要件名}/` ディレクトリが存在する（なければ作成）
- 思考は英語で実施。ファイルは日本語で記述
- task_id は `TASK-{4桁ゼロ埋め}` 形式（例: TASK-0001）にする

# context

- 出力ディレクトリ: `docs/tasks/{要件名}`
- 要件名: `{要件名}` （step1 で確定）
- 作業規模: `{work_scope}` （引数。未指定の場合は `"フル機能開発"` をデフォルトとする）
- 信頼性評価: `[]`

# 変数表記の凡例

- `{要件名}` は step1 で確定する変数。実際のファイルパス生成時には具体値に置換する。
- `{work_scope}` は引数（"フル機能開発" / "軽量開発" / "カスタム" のいずれか）。

# テンプレートの対応表

skill 本文内でテンプレートを参照する際の名称と、実ファイルの対応：

| 参照名 | 実ファイル |
|---|---|
| `<full_task_template>` | `templates/full_task_template.md` |
| `<minimal_task_template>` | `templates/minimal_task_template.md` |
| `<overview_template>` | `templates/overview_template.md` |

# 作業規模と分割粒度の対応

| 作業規模（引数） | タスク分割の粒度 | 使用テンプレート |
|---|---|---|
| `"フル機能開発"` | 詳細タスク分割 | `<full_task_template>` |
| `"軽量開発"` | 軽量タスク分割 | `<minimal_task_template>` |
| `"カスタム"` | 選択項目に応じた組み合わせ | 選択次第 |

---

## step1: 開発コンテキストの準備

- **要件名の確定**
  - Bash で `pwd` を実行し、basename をプロジェクトルートディレクトリ名として取得する
  - 取得したディレクトリ名を `{要件名}` として確定する

- **専用ルールの読み込み**
  - スキルディレクトリ内の `rules/rules.md` を読み込む

- **タスクノートの読み込み**
  - `docs/spec/{要件名}/note.md` を読み込む
  - ノートには技術スタック、開発ルール、関連実装、設計文書、注意事項が含まれる
  - **存在しない場合**: beam1-tasknote を先に実行する必要がある旨を警告し、AskUserQuestion で継続するか確認する

- **追加ルールの読み込み（存在する場合のみ）**
  - `docs/rule/` ディレクトリ
  - `docs/rule/beam/` ディレクトリ
  - `docs/rule/beam/tasks/` ディレクトリ
  - 各ディレクトリ内のすべてのファイルを読み込み、追加ルールとして適用

- **技術スタック定義の読み込み**
  - `docs/tech-stack.md` が存在する場合は読み込み
  - 存在しない場合は `CLAUDE.md` から技術スタックセクションを読み込み
  - どちらも存在せず技術スタックが特定できない場合は、AskUserQuestion でユーザーに確認する

- **要件定義・設計文書の読み込み**
  - `docs/spec/{要件名}/requirements.md` を読み込み
  - `docs/spec/{要件名}/design/architecture.md` を読み込み
  - `docs/spec/{要件名}/design/database-schema.sql` を読み込み（存在する場合のみ）
  - `docs/spec/{要件名}/design/api-endpoints.md` を読み込み（存在する場合のみ）
  - `docs/spec/{要件名}/design/interfaces.ts` を読み込み（存在する場合のみ）
  - `docs/spec/{要件名}/design/dataflow.md` を読み込み
  - 読み込んだ技術スタック定義に基づいて実装技術を特定
  - **設計文書が見つからない場合**: beam3-design を先に実行する必要がある旨を警告し、AskUserQuestion で継続するか確認する

- **既存タスクファイルの確認**
  - Task tool (subagent_type: Explore, thoroughness: quick) を使用して既存タスクIDを探索
  - 既存の `docs/tasks/{要件名}/TASK-*.md` ファイルを確認
  - 使用済みタスク番号（TASK-0000形式）を抽出
  - 新規タスクで重複しない番号を割り当て

- **スコープ選定の確認（scope-options.md）**: `docs/spec/{要件名}/scope-options.md` の**選定記録が要望案以外**で、再整列チェックに tasks が未完了で残っている場合は**選択案モード**で動作する:
  - 既存の `docs/tasks/{要件名}/TASK-*.md`・`overview.md` は**旧案の産物として破棄し、選択案の要件・設計から再生成**する（番号は 0001 から振り直してよい）
  - tasks.db の `"{要件名}"` テーブルは **DROP して再作成**する（全タスク未着手・ready のため安全。`_projects` は UPSERT で更新される）
  - 完了後（step5 の後）、scope-options.md の再整列チェックの tasks を ✅ に更新する

- step2 を実行する

## step2: 作業規模の確認

- `{work_scope}` の値に応じて分岐：
  - `"フル機能開発"`: そのまま step3 に進む
  - `"軽量開発"`: そのまま step3 に進む
  - `"カスタム"`: 以下の AskUserQuestion を実施してから step3 に進む

- カスタム時の質問:
  ```
  AskUserQuestion({
    questions: [{
      question: "タスク分割に含める項目を選択してください（複数選択可）",
      header: "含める項目",
      multiSelect: true,
      options: [
        { label: "詳細なテスト要件", description: "各タスクに単体・統合テスト要件を詳細に記載" },
        { label: "UI/UX要件", description: "ローディング・エラー表示・モバイル対応・アクセシビリティ要件を記載" },
        { label: "詳細な実装手順", description: "各タスクに実装ファイル・コード例を含む詳細手順を記載" },
        { label: "依存関係の詳細化", description: "クリティカルパス・並行実行可能タスクを詳細に分析" }
      ]
    }]
  })
  ```
- 選択結果を `custom_items` として保持し、step3, step4 で参照する

## step3: タスク分析とヒアリング

作業規模に応じてヒアリング項目を調整。

**重要**: 以下の質問は例示。実際のプロジェクト状況に応じて AskUserQuestion ツールを使用して適切な質問を作成すること。

### 共通ルール

- すべての質問は AskUserQuestion ツールで実施する
- すべての質問を一度に投げず、文脈に応じて段階的に質問する
- ユーザーの回答を受けて、必要に応じて追加質問を行う
- 質問は具体的で、選択肢から選べる形式にする（自由記述は「その他」オプションで対応 — 自動付与される）

### フル機能開発の場合

以下のカテゴリごとに、設計文書から特定した具体的な課題・不明点について質問する：

**タスク粒度の確認**
- 1タスクあたりのストーリーポイント上限（粒度）について確認
- より細かく分割するか、ある程度まとめるかを質問

例:
```
AskUserQuestion({
  questions: [{
    question: "1タスクあたりの粒度（ストーリーポイント上限）はどの程度にしますか？",
    header: "タスク粒度",
    multiSelect: false,
    options: [
      { label: "標準（最大5SP程度）", description: "標準的な実装単位でタスク分割" },
      { label: "細かめ（最大3SP程度）", description: "より小さい単位に細分化" }
    ]
  }]
})
```

**実装優先順位の確認**
- 設計文書の実装順序
- 並行実行可能なタスクの優先順位
- フェーズ分割の基準

**技術的制約の確認**
- 技術スタックの選択
- パフォーマンス要件の実装方法
- 外部システム連携のタイミング

**テスト要件の詳細化**
- 単体テストのカバレッジ目標
- 統合テストの実施範囲
- E2Eテストの実施タイミング

**UI/UX実装の詳細確認**
- ローディング状態の実装方針
- エラー表示の詳細
- モバイル対応の範囲
- アクセシビリティ要件の詳細

### 軽量開発の場合

**必須項目のみ確認** — 簡潔に質問する:
- 主要なタスクの実行順序の確認
- 基本的な依存関係の確認
- 最低限のテスト要件確認

### カスタム開発の場合

step2 で選択された項目（`custom_items`）に関連するヒアリングのみ実施する。

### ヒアリング記録の作成

すべての質問と回答を記録する。各質問について以下を記録：
- 質問内容
- 質問日時
- カテゴリ（タスク粒度/優先順位/技術制約/テスト要件/UI要件）
- 質問の背景（なぜこの質問が必要だったか）
- ユーザーからの回答
- 信頼性への影響（この回答により信頼性レベルがどう変化したか）

ヒアリング結果のサマリーを作成する。

- step4 を実行する

## step4: タスク作成

**【重要】**: このステップでは、洗い出したすべてのタスクファイルを作成する必要があります。途中で止めないでください。

**【信頼性レベル指示】**:
各項目について、情報源（PRD・タスクノート・要件定義書・設計文書・ユーザヒアリング応答・CLAUDE.md）との照合状況を以下の信号でコメントしてください：

- 🔵 **青信号**: 情報源に明示的な記載があり、ほぼ推測していない
- 🟡 **黄信号**: 情報源から妥当な推測ができる
- 🔴 **赤信号**: 情報源に無い推測

### 4.1 タスクの洗い出し

設計文書に基づいて、以下のカテゴリでタスクを洗い出す：

- 基盤タスク（DB設定、環境構築など）
- バックエンドタスク（API実装）
- フロントエンドタスク（UI実装）
  - 画面のグループ毎に細かく分割する
- 統合タスク（E2Eテストなど）

**洗い出しの記録**:
- 洗い出したタスクの総数を記録する
- 各カテゴリごとのタスク数を記録する
- この総数が、step4.6 で作成するファイル数と一致する必要がある

### 4.2 依存関係の分析

- タスク間の依存関係を明確化
- 並行実行可能なタスクを識別
- クリティカルパスを特定

### 4.3 タスクの詳細化と見積もり

各タスクについて、まず詳細項目を定義し（4.3.1）、次にストーリーポイントを見積もる（4.3.2）。

#### 4.3.1 タスク詳細項目

各タスクに以下を含める：
- タスクID（TASK-{4桁ゼロ埋め}形式）
- タスク名
- タスクタイプ（TDD/DIRECT）
  - **TDD**: コーディング、ビジネスロジック実装、UI実装、テスト実装など開発作業
  - **DIRECT**: 環境構築、設定ファイル作成、ドキュメント作成、ビルド設定など準備作業
- 要件へのリンク（**カバーする REQ/NFR ID を明記**。後述 4.8 の要件カバレッジ照合の根拠になる）
  - **列挙を含む要件は要約せず引き継ぐ**: 要件が複数項目を列挙している場合（例:「`a`, `b`, `c` … を表示する」）、実装詳細・テスト要件に**列挙項目をすべて明記**する（「〜情報を表示」等にまとめない）。部分実装が完了に見える事故を防ぐため
- 依存タスク
- 実装詳細（信頼性レベル付き）
- 単体テスト要件（信頼性レベル付き）
- 統合テスト要件（信頼性レベル付き）
- UI/UX要件（該当する場合、信頼性レベル付き）
  - ローディング状態
  - エラー表示
  - モバイル対応
  - アクセシビリティ要件
- タスク全体の信頼性レベル評価
- **ストーリーポイント・不確実性バッファ・複雑度**（4.3.2 で算出）

#### 4.3.2 ストーリーポイント見積もり

各タスクについて、**工数（時間）ではなく、相対的な実装規模・複雑性を表すストーリーポイント**を算出する。見積もりの**基準・スケール・バッファ・アンカーの詳細は `estimate-storypoint` スキルに集約**されているため、本スキルからは `estimate-storypoint` を呼び出して算出する。

##### 見積もりの実行

- **Skill ツールで `estimate-storypoint` を呼び出す**
  - 入力（インラインモード）として、4.3.1 で詳細化した各タスクの情報（タスクID・タスク名・実装詳細・テスト要件・既存コードへの影響範囲等）を渡す
  - 全タスクをまとめて渡し、JSON 配列で受け取るのが効率的（タスクごとに `task_id` 付き）
  - `estimate-storypoint` は各タスクについて以下を含む JSON を返す:
    - `story_point`（小数点第一位）
    - `buffer_percent`（整数%）
    - `complexity`（`Low` / `Medium` / `High` / `Very High`）
    - `reason`（見積もり根拠の配列）

##### 見積もり結果の記録

`estimate-storypoint` から受け取った値を、各タスクの以下に反映する：

| 項目 | 反映先 |
|---|---|
| `story_point` | タスクファイル（4.6）ヘッダー / DB（4.7） |
| `buffer_percent` | タスクファイル（4.6）ヘッダー / DB（4.7） |
| `complexity` | タスクファイル（4.6）ヘッダー / DB（4.7） |
| `reason` | タスクファイル（4.6）「見積もり根拠」セクション |

##### beam4 固有の後処理ルール

`estimate-storypoint` の結果を受けて、beam4 では以下を適用する：

- **`story_point` が 13.1 以上のタスクは、4.1 に戻って複数タスクへ分割する**（分割後に再度 `estimate-storypoint` で見積もり直す）
- **`buffer_percent` が 51% 以上のタスクは信頼性レベル🔴とし**、step3 で追加ヒアリングするか、overview に「要再確認」と明記する

### 4.4 タスクの順序付け

- 依存関係に基づいて実行順序を決定
- マイルストーンを設定
- 並行実行可能なタスクをグループ化

### 4.5 フェーズ分割

- 各タスクは独立して実装・テスト可能な単位に分割する
  - 4.3.2 のスケールでストーリーポイントが 13.1 以上のタスクは、4.1 に戻って複数タスクへ分割する
- タスクを **1スプリント**（10日想定）以内の規模でフェーズにまとめる
  - **1フェーズあたり合計30ストーリーポイント以内**を上限とする
  - フェーズの分割はアーキテクチャのレイヤー（基盤 → バックエンド → フロントエンド → 統合）を基準にする
  - 事前に固定した分割基準を前提とせず、タスクの依存関係とストーリーポイント合計から判断する

### 4.6 個別タスクファイルの作成

- **重要**: 各タスクを個別ファイルで作成
- **必須**: step4.1 で洗い出したすべてのタスクファイルを作成する（途中で止めない）
- 出力先ディレクトリが存在しない場合は Bash の `mkdir -p docs/tasks/{要件名}` で作成
- **フェーズ別並列処理**: フェーズ毎に Task ツールを使い、複数フェーズを並列実行して効率的にファイルを作成する
- 作業規模に応じた テンプレートを選択：
  - フル機能開発: `<full_task_template>`
  - 軽量開発: `<minimal_task_template>`
  - カスタム: 選択項目に応じた組み合わせ

- **作成プロセス**:
  1. step4.1 で洗い出した全タスクリストを確認
  2. 洗い出した全タスク情報（タスクID、タスク名、タイプ、ストーリーポイント、不確実性バッファ、複雑度、見積もり根拠、フェーズ、依存関係、実装詳細、テスト要件等）をフェーズ別に整理
  3. **フェーズ毎に並列で Task ツールを実行** (1つのメッセージで複数の Task tool calls を送信):
     - Phase 1タスク用の Task tool call
     - Phase 2タスク用の Task tool call
     - Phase 3タスク用の Task tool call
     - Phase 4タスク用の Task tool call
     - (フェーズ数に応じて調整)
  4. 各 Task tool call には以下を含む詳細なプロンプトを指定：
     - 該当フェーズのタスクリスト（タスク番号、タスク名、タイプ、依存関係等）
     - 各タスクの詳細情報（実装詳細、テスト要件、UI/UX要件等）
     - 使用するテンプレート（`<full_task_template>` または `<minimal_task_template>`）
     - ファイル出力先: `docs/tasks/{要件名}/TASK-XXXX.md`
     - 信頼性レベルの付与ルール
     - 注意事項: "このフェーズのすべてのタスクファイルを作成すること。途中で止めないこと。"
  5. すべての Task ツールの実行完了を待つ
  6. 作成されたファイル数と洗い出したタスク数が一致することを確認

- 各タスクファイルには以下を含める：
  - タスク全体の信頼性レベル（🔵🟡🔴）
  - 実装詳細の各項目に信頼性レベル（🔵🟡🔴）
  - テスト要件の各項目に信頼性レベル（🔵🟡🔴）
  - ファイル末尾に信頼性レベルサマリー
  - 関連文書へのリンク（overview、要件定義、設計文書）

- **チェックポイント**:
  - 洗い出したタスク数: {N}件
  - 作成したファイル数: {N}件
  - フェーズ別作成数の確認（Phase 1: X件, Phase 2: Y件, ...）
  - すべてのタスクファイルが作成されたことを確認

**重要**:
- 各 Task ツールに渡すプロンプトには、該当フェーズの全タスクの完全な情報を含めること
- エージェントが追加のコンテキスト収集なしで全ファイルを作成できるようにする
- 複数のフェーズの Task tool calls を1つのメッセージで送信し、並列実行を最大化する

### 4.7 全タスクのリストをローカル SQLite DB に書き込み

全タスクの情報を **`data/tasks.db`** （SQLite）に書き込む。

**SQLite の前提**: SQLite では「ファイル＝データベース」であり、データベース作成という概念は無い。`sqlite3 data/tasks.db ...` を実行すると、ファイルが無ければ自動生成される。**事前のデータベース作成は不要**。複数プロジェクトのテーブルが 1 つの DB ファイル内に同居する設計とし、プロジェクト一覧管理用の `_projects` メタデータテーブルを併設する。

#### 4.7.1 事前準備

1. **`sqlite3` コマンドの確認**:
   - Bash で `sqlite3 -version` を実行して利用可能か確認
   - **利用できない場合**: DB 書き込みをスキップし、その旨をユーザーに伝えて step5 に進む（タスクファイルと overview があれば後続フェーズは進められる）

2. **`data/` ディレクトリの作成**:
   - Bash で `mkdir -p data` を実行（既存なら何もしない）

3. **DBファイルの自動作成**:
   - `data/tasks.db` が存在しない場合、初回の `sqlite3 data/tasks.db ...` 実行時に自動作成される（明示的な追加処理は不要）

#### 4.7.2 スキーマ初期化

以下を **1 つの SQL スクリプト**にまとめて、`sqlite3 data/tasks.db` に流し込む。すべて `IF NOT EXISTS` 付きで冪等（毎回実行しても安全）。

**PRAGMA 設定**:

```sql
-- 接続単位の設定（接続のたびに必要）
PRAGMA foreign_keys = ON;

-- データベース単位の設定（DBファイルに永続化、冪等）
PRAGMA journal_mode = WAL;
PRAGMA user_version = 2;
```

- `foreign_keys = ON`: 将来の外部キー制約に備える
- `journal_mode = WAL`: Notion 同期など並行アクセスに対する安全性を確保
- `user_version = 2`: スキーマバージョン管理（マイグレーション用。現行スキーマは v2 = ストーリーポイント列を含む）

**日時のタイムゾーン（JST固定）**:

すべての日時カラム（`created_at` / `updated_at`）は **JST（日本標準時、UTC+9）** で記録する。SQLite の `datetime('now', '+9 hours')` を使用することで、実行マシンのタイムゾーン設定に関わらず常に JST が記録される。

- `datetime('now')` は UTC を返す
- `datetime('now', 'localtime')` はマシン依存（Docker/CI が UTC だとずれる）→ **使用しない**
- `datetime('now', '+9 hours')` は常に UTC+9 = JST → **これを使用する**
- 日本は DST（夏時間）が無いため `+9 hours` で常に正しい JST になる

**メタデータテーブル `_projects`**:

```sql
CREATE TABLE IF NOT EXISTS _projects (
  requirement_name  TEXT    PRIMARY KEY NOT NULL,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now', '+9 hours')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now', '+9 hours')),
  schema_version    INTEGER NOT NULL DEFAULT 2,
  total_tasks       INTEGER NOT NULL DEFAULT 0,
  total_story_point REAL    NOT NULL DEFAULT 0,
  description       TEXT
);
```

このテーブルは「どの要件名のテーブルが存在するか」を一覧するためのもの。先頭の `_` で要件名テーブル群と区別する（要件名はケバブケースなので `_` 始まりとは絶対に衝突しない）。

**要件名テーブル**:

要件名（ケバブケース。例: `user-auth-system`）をテーブル名とする。**ハイフンを含むためダブルクォートで囲む**ことが必須。

```sql
CREATE TABLE IF NOT EXISTS "{要件名}" (
  phase                INTEGER NOT NULL,
  task_id              TEXT    PRIMARY KEY NOT NULL,
  status               TEXT    NOT NULL DEFAULT 'ready'
                                CHECK (status IN ('ready', 'in_progress', 'in_review', 'done')),
  title                TEXT    NOT NULL,
  content              TEXT,           -- タスク概要（1〜3文・200字以内の要約）。4.7.4 の書き込みルール参照
  task_type            TEXT    NOT NULL
                                CHECK (task_type IN ('TDD', 'DIRECT')),
  story_point          REAL,           -- ストーリーポイント（小数点第一位）。4.3.2 で算出
  buffer_percent       INTEGER,        -- 不確実性バッファ（整数%）。4.3.2 で算出
  complexity           TEXT            -- 複雑度。4.3.2 で算出
                                CHECK (complexity IS NULL OR complexity IN ('Low', 'Medium', 'High', 'Very High')),
  blocked_by           TEXT,           -- 前提タスクID。複数ある場合はカンマ区切り（例: "TASK-0001,TASK-0002"）。無ければ NULL
  created_at           TEXT    NOT NULL DEFAULT (datetime('now', '+9 hours')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now', '+9 hours')),
  update_badge         INTEGER NOT NULL DEFAULT 1,
  notion_sync_status   TEXT    NOT NULL DEFAULT 'not_synced'
                                CHECK (notion_sync_status IN ('not_synced', 'synced', 'pending_deletion', 'sync_failed', 'syncing')),
  is_deleted           INTEGER NOT NULL DEFAULT 0,
  task_file            TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_{要件名}_phase"  ON "{要件名}" (phase);
CREATE INDEX IF NOT EXISTS "idx_{要件名}_status" ON "{要件名}" (status);
```

**既存テーブルのマイグレーション（v1 → v2）**:

`story_point` 等を持たない旧スキーマ（v1）でテーブルが既に作成されている場合、`CREATE TABLE IF NOT EXISTS` では新カラムは追加されない。`PRAGMA user_version` を確認し、値が 2 未満かつ対象テーブルが既存の場合は、以下を実行してから `PRAGMA user_version = 2` に更新する（**新規 DB・新規テーブルの場合は不要**。テーブルが存在しなければスキップ）:

```sql
ALTER TABLE "{要件名}" ADD COLUMN story_point    REAL;
ALTER TABLE "{要件名}" ADD COLUMN buffer_percent INTEGER;
ALTER TABLE "{要件名}" ADD COLUMN complexity     TEXT;
ALTER TABLE _projects  ADD COLUMN total_story_point REAL NOT NULL DEFAULT 0;
```

**`updated_at` 自動更新トリガー**:

`updated_at` が明示的に更新されていない場合のみ自動更新する。Notion 同期側など他処理が UPDATE する場合の安全網。

```sql
CREATE TRIGGER IF NOT EXISTS "trg_{要件名}_set_updated_at"
AFTER UPDATE ON "{要件名}"
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at  -- updated_at が明示更新されていない場合のみ発火
BEGIN
  UPDATE "{要件名}" SET updated_at = datetime('now', '+9 hours') WHERE task_id = NEW.task_id;
END;
```

`WHEN` 句で「更新前後で `updated_at` が同じ」場合のみ発火させることで、無限再帰を防ぐ。

#### 4.7.3 カラム仕様（一覧）

要件名テーブルのカラム：

| カラム | 型 | NULL | デフォルト | 取り得る値 / 説明 |
|---|---|---|---|---|
| `phase` | INTEGER | NOT NULL | — | フェーズ番号（1, 2, 3, ...） |
| `task_id` | TEXT | NOT NULL | — | **PRIMARY KEY**。形式 `TASK-XXXX`（例: `TASK-0001`） |
| `status` | TEXT | NOT NULL | `'ready'` | `ready` / `in_progress` / `in_review` / `done` |
| `title` | TEXT | NOT NULL | — | タスク名 |
| `content` | TEXT | NULL可 | — | **タスク概要（1〜3文・200字以内の要約）**。TASK-*.md の本文・全文を入れない（→ 4.7.4 の書き込みルール） |
| `task_type` | TEXT | NOT NULL | — | `TDD` / `DIRECT` |
| `story_point` | REAL | NULL可 | — | ストーリーポイント（小数点第一位、例: 2.8）。4.3.2 で算出 |
| `buffer_percent` | INTEGER | NULL可 | — | 不確実性バッファ（整数%、例: 20）。4.3.2 で算出 |
| `complexity` | TEXT | NULL可 | — | `Low` / `Medium` / `High` / `Very High`。4.3.2 で算出 |
| `blocked_by` | TEXT | NULL可 | — | 前提タスクID（複数ならカンマ区切り）。無ければ NULL |
| `created_at` | TEXT | NOT NULL | `datetime('now', '+9 hours')` | **JST**（例: `2026-05-28 12:34:56` = JST。タイムゾーン記号は省略） |
| `updated_at` | TEXT | NOT NULL | `datetime('now', '+9 hours')` | **JST**。UPSERT 時は現在時刻（JST）に更新（トリガーでも自動更新） |
| `update_badge` | INTEGER | NOT NULL | `1` | 「未同期」フラグ。書き込み・更新時 `1`、Notion 同期後 `0` |
| `notion_sync_status` | TEXT | NOT NULL | `'not_synced'` | `not_synced` / `synced` / `pending_deletion` / `sync_failed` / `syncing` |
| `is_deleted` | INTEGER | NOT NULL | `0` | 論理削除フラグ（0=有効, 1=削除済） |
| `task_file` | TEXT | NOT NULL | — | タスクファイルの相対パス（例: `docs/tasks/{要件名}/TASK-0001.md`） |

メタデータテーブル `_projects` のカラム：

| カラム | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| `requirement_name` | TEXT | NOT NULL | — | **PRIMARY KEY**。要件名（ケバブケース） |
| `created_at` | TEXT | NOT NULL | `datetime('now', '+9 hours')` | プロジェクト初回登録日時（**JST**） |
| `updated_at` | TEXT | NOT NULL | `datetime('now', '+9 hours')` | プロジェクト最終更新日時（**JST**） |
| `schema_version` | INTEGER | NOT NULL | `2` | テーブルスキーマのバージョン |
| `total_tasks` | INTEGER | NOT NULL | `0` | 現在のタスク総数（`is_deleted=0` のみカウント） |
| `total_story_point` | REAL | NOT NULL | `0` | 全タスクの `story_point` 合計（`is_deleted=0` のみ） |
| `description` | TEXT | NULL可 | — | プロジェクト概要（PRD またはタスクノートから抽出） |

#### 4.7.4 データ書き込み（UPSERT パターン）

全タスクをまとめて **UPSERT** する。`task_id` の重複時は既存行を更新し、`updated_at` を現在時刻に、`update_badge` を `1` にリセットする。最後に `_projects` メタデータも更新する。**全体を 1 つのトランザクションで囲む**こと。

```sql
BEGIN TRANSACTION;

-- 各タスクについて以下を繰り返す
INSERT INTO "{要件名}"
  (phase, task_id, title, content, task_type, story_point, buffer_percent, complexity, blocked_by, task_file)
VALUES
  ({phase}, '{task_id}', '{title}', '{content}', '{task_type}', {story_point}, {buffer_percent}, '{complexity}', {blocked_by_or_null}, '{task_file}')
ON CONFLICT(task_id) DO UPDATE SET
  phase          = excluded.phase,
  title          = excluded.title,
  content        = excluded.content,
  task_type      = excluded.task_type,
  story_point    = excluded.story_point,
  buffer_percent = excluded.buffer_percent,
  complexity     = excluded.complexity,
  blocked_by     = excluded.blocked_by,
  task_file      = excluded.task_file,
  updated_at     = datetime('now', '+9 hours'),
  update_badge   = 1;

-- ...全タスク分繰り返し

-- メタデータテーブルの更新（UPSERT）
INSERT INTO _projects (requirement_name, total_tasks, total_story_point, description)
VALUES ('{要件名}', {タスク総数}, {合計SP}, '{プロジェクト概要}')
ON CONFLICT(requirement_name) DO UPDATE SET
  total_tasks       = excluded.total_tasks,
  total_story_point = excluded.total_story_point,
  description       = excluded.description,
  updated_at        = datetime('now', '+9 hours');

COMMIT;
```

**書き込みルール**:
- 要件名テーブルへの `INSERT` 文では `status` / `created_at` / `updated_at` / `update_badge` / `notion_sync_status` / `is_deleted` を**指定しない**
  - これにより新規行はデフォルト値が適用され、既存行の UPSERT 時は `status` / `created_at` / `notion_sync_status` / `is_deleted` の既存値が保持される
- 文字列にシングルクォートを含む場合は SQL エスケープ（`'` → `''`）する
- **`content` には「タスク概要」＝ 1〜3文・200字以内の要約**を渡す。**TASK-*.md の本文や全文を入れてはならない**
  - 作り方: TASK-*.md の `## タスク概要` セクションを 1〜3文に圧縮する（**そのままコピーしない**）。見出し・箇条書き・表・リンクなど Markdown 記法は含めず、地の文だけにする
  - 書くこと＝「何を作る／変えるか」＋「実装上の勘所を1つ」。書かないこと＝見積もり根拠・関連文書リンク・カバーする要件・テスト要件・完了条件
  - ✅ 良い例: `モーダルの器として @radix-ui/react-dialog を導入し、既存の依存方針に例外と理由を明記する。`
  - ❌ 悪い例: `# TASK-0001: ...` で始まる TASK ファイルの全文／`NULL`（空）のまま放置
  - **空にしない。** 未記入だと一覧でタスクの中身が一切読めなくなる
  - **なぜ**: この列はダッシュボード（TaskBridge）の「内容」列と Notion 同期の本文に**そのまま・切り詰めなしで**描画される。全文を入れると一覧が読めなくなるうえ、**Notion 同期は `content` を1つの rich_text として分割せずに送る**ため、Notion の上限（1オブジェクト 2,000字）を超えた行は**同期そのものが失敗する**
- `blocked_by` が空の場合は `NULL` を渡す（`''` ではない）
- `story_point` / `buffer_percent` / `complexity` は 4.3.2 の見積もり結果を渡す
  - `story_point`（REAL）と `buffer_percent`（INTEGER）はクォートしない
  - `complexity` は `'Low'` / `'Medium'` / `'High'` / `'Very High'` のいずれかをクォートして渡す
  - いずれも未見積もりの場合のみクォート無しの `NULL` を渡す
- `{タスク総数}` は今回投入する全タスクの件数（`is_deleted=0` 相当）
- `{合計SP}` は今回投入する全タスクの `story_point` の合計
- `{プロジェクト概要}` は PRD の概要セクション、または `note.md` の最初の段落から短く抽出する。生成できない場合は NULL

#### 4.7.5 実装方法

`sqlite3` コマンドを Bash 経由で実行する。書き込み内容は一時的な `.sql` ファイル（例: `/tmp/beam4-tasks.sql`）に出力してから、以下のように一括実行するのが安全:

```bash
sqlite3 data/tasks.db < /tmp/beam4-tasks.sql
```

実行する SQL スクリプトの構造（PRAGMA → スキーマ → データの順）:

```sql
-- 1. 接続単位の設定
PRAGMA foreign_keys = ON;

-- 2. データベース単位の設定（冪等）
PRAGMA journal_mode = WAL;
PRAGMA user_version = 2;

-- 3. メタデータテーブル
CREATE TABLE IF NOT EXISTS _projects (...);

-- 4. 要件名テーブルとインデックス・トリガー
CREATE TABLE IF NOT EXISTS "{要件名}" (...);
CREATE INDEX IF NOT EXISTS "idx_{要件名}_phase"  ON "{要件名}" (phase);
CREATE INDEX IF NOT EXISTS "idx_{要件名}_status" ON "{要件名}" (status);
CREATE TRIGGER IF NOT EXISTS "trg_{要件名}_set_updated_at" ... ;

-- 5. データ UPSERT
BEGIN TRANSACTION;
INSERT INTO "{要件名}" ... ON CONFLICT(task_id) DO UPDATE SET ...;
-- ... 全タスク
INSERT INTO _projects ... ON CONFLICT(requirement_name) DO UPDATE SET ...;
COMMIT;
```

ヒアドキュメントで直接渡す方法も可:

```bash
sqlite3 data/tasks.db <<'SQL'
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
...
COMMIT;
SQL
```

#### 4.7.6 エラー処理

- スキーマ作成・データ書き込みに失敗した場合は、エラー内容をユーザーに表示
- AskUserQuestion で「再試行 / スキップして step5 へ進む / 中止」を確認
- 中止以外の場合は step5 に進む

- 完了後 4.8 を実行する

### 4.8 要件カバレッジ照合（ゲート）【必須】

**目的**: 「定めた要件が、対応タスクの欠落によって実装まで届かない」事故を構造的に防ぐ。要件とタスクの対応を機械的に照合し、**対応の無い要件が残るうちは step5（完了）に進ませない**。

> 背景:「一覧に N 項目を表示する」要件に対し表示タスクが一部項目しか作られず、実装が部分達成のまま完了扱いになった事故があった。本ゲートはその再発防止である。

#### 4.8.1 トレーサビリティ行列の作成

- `requirements.md` から **すべての要件 ID を抽出**する（`REQ-*`・`NFR-*` は必須。`EDGE-*` も含めることを推奨）
- 各要件 ID に対し、それをカバーするタスク（`TASK-*`）を対応付け、**REQ → TASK の行列**を作る
  - 対応の根拠は各タスクファイル（4.6）の「要件へのリンク」と実装詳細
- **列挙を含む要件は項目単位で確認**する（例:「`a,b,c,d` を表示」なら 4 項目すべてがどこかのタスクでカバーされているか）。1 タスクに集約してよいが、**項目の取りこぼしが無いこと**

#### 4.8.2 カバレッジ判定（ゲート）

各要件 ID を次のいずれかに分類する:

- ✅ **カバー済み**: 対応タスクが 1 件以上ある
- 🟢 **タスク不要（要正当化）**: 実装タスクを要さない要件（否定的制約「〜してはならない」、運用・組織側の NFR、設計時点で充足済みの制約等）。**「なぜタスク不要か」を一言必ず添える**（セキュリティガードレールの「適用しない規則は理由を述べる」と同じ方針）
- ❌ **未カバー**: 対応タスクが無く、正当化もできない → **ゲート不合格**

- **❌ が 1 件でもあれば step5 に進まない**。次のいずれかで解消する:
  1. **4.1 に戻ってタスクを追加**し、4.3（見積もり）→ 4.6（ファイル）→ 4.7（DB）→ 4.8（再照合）をやり直す
  2. 要件自体が誤り/不要なら AskUserQuestion でユーザーに確認のうえ 🟢（理由付き）へ変更する
- すべて ✅ または 🟢 になったら step5 に進む

#### 4.8.3 記録

- REQ→TASK 行列は overview（5.1）の「要件カバレッジ」セクションに出力する
- 🟢（タスク不要）の要件と理由、❌ を解消した経緯も併記する

- 完了後 step5 を実行する

## step5: overview作成と完了報告

### 5.1 overviewファイルの作成

- 全タスクファイル作成後に overview を作成
- 作成したタスクファイルの情報を集約
- `<overview_template>` を使用してファイルを作成
- **4.8 の要件カバレッジ行列を overview の「要件カバレッジ」セクションに記載する**（REQ→TASK、🟢 タスク不要の理由を含む）
- `docs/tasks/{要件名}/overview.md` に出力

### 5.2 品質評価

作成したタスクファイルの内容について、品質判定基準に基づいて以下を評価：
- タスクの粒度の適切性
- 依存関係の完全性
- 実装可能性
- 信頼性レベル（🔵🟡🔴の分布） - すべてのタスクファイルを通じて集計

品質判定結果をユーザーに表示する（全ファイル統合の信頼性レベル分布を含む）

### 5.3 TODO更新

- TodoWrite ツールで TODO ステータスを更新する
  - タスク分割フェーズを「completed」にマーク
  - 次のフェーズ「タスク実装（beam5-implement）」をTODOに追加
  - 品質判定結果をTODO内容に記録
  - TODO が存在しない場合は新規作成する

### 5.4 完了報告

完了報告を表示：
- step1 で収集した開発コンテキスト情報のサマリー
- step3 でのヒアリング結果と設計文書との差分
- **作成ファイル数の確認**:
  - 洗い出したタスク総数: {N}件
  - 作成したタスクファイル数: {N}件
  - overviewファイル: 1件
  - ✅ すべてのタスクファイルが作成されたことを確認
- **要件カバレッジの確認（4.8 ゲート結果）**:
  - 要件 ID 総数: {N}件（REQ {n} / NFR {n}）
  - ✅ カバー済み {n} / 🟢 タスク不要・理由付き {n} / ❌ 未カバー {n}
  - ✅ ❌（未カバー）が 0 件であることを確認
- 作成したファイルのパス一覧（overview.md、各タスクファイル）
- 各タスクファイルの信頼性レベル分布
- 全体の信頼性レベル分布（すべてのタスクファイルを通じた集計）
- タスク総数、合計ストーリーポイント、フェーズ数
- 各ファイル内のリンクが正しく設定されていることを確認

次のステップ表示: 「次の推奨ステップ: `beam5-implement` でタスクを実装します。特定のタスクを実装する場合は `beam5-implement TASK-0001` のように指定してください。」

## step6: Git 連携（フェーズブランチへコミット＋スタックド PR）

beam4 が生成したタスク分解（`overview.md` / `TASK-*.md`）を**フェーズブランチ `beam4-{要件名}`**（前フェーズ `beam3-{要件名}` の上に分岐）へコミットし、**スタックド PR を作成**する（このフェーズの生成物のみ。`data/tasks.db` は `.gitignore` で除外）。Git 処理は `beam-sync` スキルに委譲する（冪等・秘密情報はコミットしない）。

- `Skill(skill="beam-sync", args="{要件名} beam4")` を実行する
- `beam-sync` が前提未達（`gh` 未認証・git identity 未設定・非 git リポジトリ）を報告した場合は、その案内をユーザーに伝えて**フェーズ自体は完了とする**（Git 連携のみスキップ）
- 結果（ブランチ／コミット／**PR の URL**）の要約をユーザーに伝える

## step7: スコープ4案の見積もり（scope-options=on の場合のみ）

- 以下を**すべて**満たす場合のみ実行する:
  - 引数に `scope-options=on` がある
  - `docs/spec/{要件名}/scope-options.md` が存在する（beam2 step4c の define 済み）
  - scope-options.md の**選定記録が未記録**（＝要望案の初回見積もり直後）
- `Skill(skill="scope-options", args="estimate {要件名}")` を実行する
  - scope-options がマトリクスと本フェーズのタスク見積もりから追加3案の SP をハイブリッド導出（継承🔵/再見積🟡/新規🔴）し、比較表を提示して**「どの案で実装に進むか」を確認**し、選定記録を書き込む
  - **要望案以外が選ばれた場合**: scope-options が再整列（beam2→beam3→beam4 の選択案モード再実行）を案内する。オーケストレーター経由なら自動で再実行される。**再実行後の本 step は選定記録が記録済みのためスキップされる**
- 条件を満たさない場合はスキップして終了する
