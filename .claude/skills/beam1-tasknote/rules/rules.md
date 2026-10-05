# rules

## ファイル名のルール

### 出力ファイルのパス形式（階層構造）

- `docs/spec/{要件名}/note.md`
- 例: `docs/spec/user-auth-system/note.md`

### ディレクトリ作成

- `docs/spec/{要件名}/` ディレクトリが存在しない場合は Bash の `mkdir -p` で作成する
- 必要に応じて親ディレクトリも作成する

### 要件名の命名規則

- 要件名を簡潔な英語に変換する
- ケバブケース（kebab-case）を使用
- 最大50文字程度に収める
- 例:
  - "ユーザー認証システム" → "user-auth-system"
  - "データエクスポート機能" → "data-export"
  - "パスワードリセット" → "password-reset"

## ファイルパスの記載ルール

- **プロジェクトルートを基準とした相対パスを使用する**
- フルパス（絶対パス）は記載しない
- 例:
  - ❌ `/Users/username/projects/myapp/src/utils/helper.ts`
  - ✅ `src/utils/helper.ts`

## 情報収集の優先順位

| 優先度 | 対象 |
|---|---|
| 必須 | `CLAUDE.md`, `README.md`, 既存の要件定義・設計書（`docs/spec/{要件名}/*.md`, `docs/design/*.md`） |
| 推奨 | 追加ルール（`docs/rule/`）, 設定ファイル（`package.json`, `tsconfig.json` 等）, Git情報 |
| オプション | 既存実装の詳細分析（Task ツールによる Explore）— 作業規模に応じて実施 |

## 安全装置（ファイル読み込みの上限）

- `docs/` 配下を Glob で列挙し、20件を超えた場合はファイル名一覧を表示して AskUserQuestion で読み込み対象を絞る
- 単一ファイルが極端に大きい場合（推定10000トークン超）は、必要箇所だけ Read の `offset` / `limit` で部分読み込みする

## TODO更新パターン

```
- コンテキスト収集フェーズを「completed」にマーク
- 次のフェーズ「要件定義作成（beam2-requirements）」をTODOに追加
- TODO が存在しない場合は新規作成する
```
