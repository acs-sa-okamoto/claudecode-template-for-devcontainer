# {要件名} 開発コンテキストノート

## 作成日時
{作成日時}

## プロジェクト概要

### プロジェクト名
{プロジェクト名}

### プロジェクトの目的
{プロジェクトの目的・概要}

**参照元**: {README.md または CLAUDE.md のパス}

## 技術スタック

### 使用技術・フレームワーク
- **言語**: {プログラミング言語}
- **フレームワーク**: {使用フレームワーク}
- **ランタイム**: {Node.js, Python等}
- **パッケージマネージャー**: {npm, yarn, pip等}

### アーキテクチャパターン
- **アーキテクチャスタイル**: {MVC, クリーンアーキテクチャ, マイクロサービス等}
- **設計パターン**: {使用している設計パターン}
- **ディレクトリ構造**: {プロジェクトの構造}

**参照元**:
- [CLAUDE.md](CLAUDE.md)
- [architecture.md](docs/design/architecture.md)

## 開発ルール

### プロジェクト固有のルール
{プロジェクト固有の開発ルール}

### コーディング規約
- **命名規則**: {命名規則の詳細}
- **型チェック**: {TypeScript strict mode等}
- **コメント**: {コメントのルール}
- **フォーマット**: {Prettier, ESLint等の設定}

### テスト要件
- **テストフレームワーク**: {Jest, Pytest等}
- **カバレッジ要件**: {最低カバレッジ率}
- **テストパターン**: {AAA, Given-When-Then等}

**参照元**:
- [AGENTS.md](AGENTS.md)
- [docs/rule/](docs/rule/)
- [docs/rule/beam/](docs/rule/beam/)

## 既存の要件定義

### 要件定義書
{既存の要件定義の要約}

**参照元**:
- [requirements.md](docs/spec/{要件名}/requirements.md)
- [user-stories.md](docs/spec/{要件名}/user-stories.md)
- [acceptance-criteria.md](docs/spec/{要件名}/acceptance-criteria.md)

### 主要な機能要件（EARS記法）
- REQ-001: {要件の概要}
- REQ-002: {要件の概要}
- ...

### 主要な非機能要件
- NFR-001: {パフォーマンス要件}
- NFR-101: {セキュリティ要件}
- ...

## 既存の設計文書

### アーキテクチャ設計
{アーキテクチャの要約}

**参照元**: [architecture.md](docs/design/architecture.md)

### データフロー
{データフローの要約}

**参照元**: [dataflow.md](docs/design/dataflow.md)

### TypeScript型定義
{主要な型定義の要約}

**参照元**: [interfaces.ts](docs/design/interfaces.ts)

### データベース設計
{DBスキーマの要約}

**参照元**: [database-schema.sql](docs/design/database-schema.sql)

### API仕様
{APIエンドポイントの要約}

**参照元**: [api-endpoints.md](docs/design/api-endpoints.md)

## 関連実装

### 類似機能の実装例
{既存の類似実装の参照先}

**参照元**:
- [{ファイルパス1}]({ファイルパス1})
- [{ファイルパス2}]({ファイルパス2})

### 参考パターン
{実装パターンの要約}

### 共通モジュール・ユーティリティ
{使用可能な共通機能}

**参照元**:
- [{ユーティリティファイル1}]({ユーティリティファイル1})
- [{ユーティリティファイル2}]({ユーティリティファイル2})

### 依存関係・インポートパス
{重要な依存関係の情報}

## 技術的制約

### パフォーマンス制約
- {パフォーマンス要件の詳細}

### セキュリティ制約
- {セキュリティ要件の詳細}

### 互換性制約
- {ブラウザ互換性、バージョン制約等}

### データ制約
- {データサイズ、形式等の制約}

**参照元**: [CLAUDE.md](CLAUDE.md)

## 注意事項

### 開発時の注意点
- {開発時に注意すべき事項}

### デプロイ・運用時の注意点
- {デプロイ・運用時の注意事項}

### セキュリティ上の注意点
- {セキュリティ関連の注意事項}

### パフォーマンス上の注意点
- {パフォーマンス関連の注意事項}

## Git情報

### 現在のブランチ
{現在のブランチ名}

### 最近のコミット
{最近のコミット履歴（抜粋）}

### 開発状況
{現在の開発状況のサマリー}

## 収集したファイル一覧

### プロジェクト基本情報
- [CLAUDE.md](CLAUDE.md)
- [README.md](README.md)
- [AGENTS.md](AGENTS.md)

### 追加ルール
- [docs/rule/](docs/rule/)
- [docs/rule/beam/](docs/rule/beam/)

### 要件定義・仕様書
- [docs/spec/{要件名}/requirements.md](docs/spec/{要件名}/requirements.md)
- [docs/spec/{要件名}/user-stories.md](docs/spec/{要件名}/user-stories.md)
- [docs/spec/{要件名}/acceptance-criteria.md](docs/spec/{要件名}/acceptance-criteria.md)

### 設計文書
- [docs/design/architecture.md](docs/design/architecture.md)
- [docs/design/dataflow.md](docs/design/dataflow.md)
- [docs/design/interfaces.ts](docs/design/interfaces.ts)
- [docs/design/database-schema.sql](docs/design/database-schema.sql)
- [docs/design/api-endpoints.md](docs/design/api-endpoints.md)

### 関連実装（オプション）
- [{実装ファイル1}]({実装ファイル1})
- [{実装ファイル2}]({実装ファイル2})

---

**注意**: すべてのファイルパスはプロジェクトルートからの相対パスで記載しています。