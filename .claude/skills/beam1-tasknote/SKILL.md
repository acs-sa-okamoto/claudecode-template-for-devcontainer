---
name: beam1-tasknote
description: 開発のコンテキスト情報を収集してノートにまとめます。技術スタック、追加ルール、関連ファイルの情報を整理し、後続フェーズ（要件定義・設計）の入力となる note.md を生成します。
allowed-tools: Read, Glob, Grep, Task, Write, TodoWrite, Bash, AskUserQuestion, Skill
argument-hint: "[work_scope]"
---

開発の前にコンテキスト情報を収集し、開発に必要な情報をノートファイルにまとめます。

# context

- 出力ディレクトリ: `docs/spec`
- 要件名: `{要件名}` （step1 で確定）
- 作業規模: `{work_scope}` （引数。未指定の場合は `"フル機能開発"` をデフォルトとする）
- 収集情報: `[]`

# 変数表記の凡例

- `{要件名}` のように波括弧1つで囲まれたものは、step1 で確定する変数。実際のファイルパス生成時には具体値に置換する。
- `{work_scope}` は引数（"フル機能開発" / "軽量開発" / "カスタム" のいずれか）。

# 作業規模による挙動の違い

| 作業規模 | Phase 3（既存実装の詳細探索） | 収集深度 |
|---|---|---|
| フル機能開発 | 実施（デフォルトで実施を推奨） | 詳細 |
| 軽量開発 | スキップ | 必要最小限 |
| カスタム | ユーザーに確認 | 選択次第 |

---

## step1: 開発コンテキストの準備

- **要件名の確定**
  - Bash で `pwd` を実行し、basename をプロジェクトルートディレクトリ名として取得する
  - 取得したディレクトリ名を `{要件名}` として確定する
  - 取得した `{要件名}` をユーザーに表示して確認する

- **PRDファイルの読み込み**
  - `docs/spec/{要件名}/product-requirements.md` を読み込む
  - PRDが存在しない場合は警告し、ユーザーに継続するか確認する（AskUserQuestion 使用）
  - PRD（Product Requirements Document）には以下が含まれることを期待：
    - プロダクトビジョン
    - ターゲットユーザー
    - 主要機能
    - ビジネス要件
    - 成功指標

- **専用ルールの読み込み**
  - スキルディレクトリ内の `rules/rules.md` を読み込む

- **追加ルールの読み込み（存在する場合のみ）**
  - `docs/rule/` ディレクトリ
  - `docs/rule/beam/` ディレクトリ
  - `docs/rule/beam/tasknote/` ディレクトリ

- 読み込み完了後、context の内容（要件名、作業規模、PRDサマリー）をまとめてユーザに宣言する
- step2 を実行する

## step2: 既存ノートの確認

- `docs/spec/{要件名}/note.md` が既に存在する場合:
  - 既存ファイルの内容を表示
  - AskUserQuestion で「既存ノートを使用するか、再生成するか」をユーザーに確認
    - "既存を使用": スキルを終了
    - "再生成": step3 を実行
- 存在しない場合: step3 を実行する

## step3: 開発コンテキストの収集

### Phase 1: プロジェクト基本情報の収集

以下のファイルが存在する場合は読み込む（存在チェック後にRead）：
- `CLAUDE.md` （技術スタック・制約）
- `AGENTS.md`
- `README.md`

### Phase 2: 既存設計文書・仕様書の収集

以下のファイルが存在する場合は読み込む：
- `docs/spec/{要件名}/requirements.md`: 統合機能要件
- `docs/spec/{要件名}/user-stories.md`: 詳細なユーザストーリー
- `docs/spec/{要件名}/acceptance-criteria.md`: 受け入れ基準
- `docs/spec/{要件名}/interview-record.md`: 過去のヒアリング記録
- `docs/tech-stack.md`: 技術スタック

**安全装置**: `docs/` 配下の Glob で20件を超えた場合は、ファイル名一覧を表示してユーザーに読み込み対象を AskUserQuestion で確認する。

### Phase 3: 既存実装の調査

- **作業規模による分岐**:
  - `{work_scope}` が "軽量開発" の場合: スキップして Phase 4 へ
  - `{work_scope}` が "フル機能開発" の場合: 実施
  - `{work_scope}` が "カスタム" の場合: AskUserQuestion で実施有無を確認

- 実施する場合:
  - Task ツール（subagent_type: Explore）を使用して以下を探索：
    - 類似機能の実装例
    - ユーティリティ関数・共通モジュール
    - 実装パターンやアーキテクチャガイドライン
    - 依存関係やインポートパス

### Phase 4: Git情報の収集

- `git status` で現在の開発状況を確認
- `git log --oneline -20` で最近のコミット履歴を確認
- `git branch --show-current` で現在のブランチを確認

### Phase 5: プロジェクト構造の把握

- 主要ディレクトリ構造を把握（`ls` または `Glob` で第1階層・第2階層のみ）
- 設定ファイルの確認:
  - `package.json`, `tsconfig.json`, `pyproject.toml`, `Cargo.toml` などが存在する場合は Read

- step4 を実行する

## step4: 収集情報の整理と保存

- 収集した情報を `templates/note_template.md` の形式で整理する
- 以下のセクションを含める:
  1. プロジェクト概要
  2. 技術スタック
  3. 開発ルール
  4. 既存の要件定義
  5. 既存の設計文書
  6. 関連実装（Phase 3 実施時のみ）
  7. 技術的制約
  8. 注意事項
  9. Git情報
  10. 収集したファイル一覧

- Write ツールを使用して `docs/spec/{要件名}/note.md` に保存する
  - 出力ディレクトリが存在しない場合は Bash の `mkdir -p` で作成
- step5 を実行する

## step5: 完了報告

- TodoWrite ツールで TODO ステータスを更新する
  - コンテキスト収集フェーズを「completed」にマーク
  - 次のフェーズ「要件定義作成（beam2-requirements）」をTODOに追加
  - TODO が存在しない場合は新規作成する

- 完了報告を表示する:
  - 収集したファイルの一覧
  - プロジェクトの概要サマリー
  - 作成したノートファイルのパス（`docs/spec/{要件名}/note.md`）
  - 次の推奨ステップ: `beam2-requirements` で要件定義書を作成

## step6: Git 連携（フェーズブランチへコミット＋スタックド PR）

beam1 が生成したノートを**フェーズブランチ `beam1-{要件名}`**（トランクから分岐。スタックの最下段）へコミットし、**トランクへの PR を作成**する（PR にはこのフェーズの生成物のみが入る）。Git 処理は `beam-sync` スキルに委譲する（冪等・秘密情報はコミットしない）。

- `Skill(skill="beam-sync", args="{要件名} beam1")` を実行する
- `beam-sync` が前提未達（`gh` 未認証・git identity 未設定・非 git リポジトリ）を報告した場合は、その案内をユーザーに伝えて**フェーズ自体は完了とする**（Git 連携のみスキップ）
- 結果（ブランチ／コミット／**PR の URL**）の要約をユーザーに伝える
