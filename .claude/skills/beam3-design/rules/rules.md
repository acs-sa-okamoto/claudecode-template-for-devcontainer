# rules

## ファイル名のルール

### 出力ファイルのパス形式（階層構造）

すべて `docs/spec/{要件名}/design/` 配下に出力する。

- `docs/spec/{要件名}/design/architecture.md` （常時生成）
- `docs/spec/{要件名}/design/dataflow.md` （常時生成）
- `docs/spec/{要件名}/design/design-interview.md` （常時生成）
- `docs/spec/{要件名}/design/interfaces.ts` （フル機能開発、または「型定義」をカスタム選択時。対象言語に応じて拡張子変更）
- `docs/spec/{要件名}/design/database-schema.sql` （フル機能開発、または「DBスキーマ」をカスタム選択時。NoSQL の場合は `.md`）
- `docs/spec/{要件名}/design/api-endpoints.md` （フル機能開発、または「API仕様」をカスタム選択時）

### ディレクトリ作成

- `docs/spec/{要件名}/design/` ディレクトリが存在しない場合は Bash の `mkdir -p` で作成する
- 必要に応じて親ディレクトリも作成する

### 要件名の命名規則

- 要件名を簡潔な英語に変換する
- ケバブケース（kebab-case）を使用
- 最大50文字程度に収める
- 例:
  - "ユーザー認証システム" → "user-auth-system"
  - "データエクスポート機能" → "data-export"
  - "パスワードリセット" → "password-reset"

## ID 番号の参照ルール

beam3-design は **新規 ID を発行しない**。要件定義書（beam2-requirements が生成）の ID をそのまま参照する。

| 参照対象 | プレフィックス | 例 |
|---|---|---|
| 機能要件 | REQ | REQ-001, REQ-101 |
| 非機能要件 | NFR | NFR-001, NFR-101 |
| エッジケース | EDGE | EDGE-001 |

ID 範囲の詳細は `docs/spec/{要件名}/requirements.md` または beam2-requirements の rules.md を参照する。

設計要素（テーブル、エンドポイント、コンポーネント等）の命名は、要件 ID と紐付ける形で記述する：
- 例: テーブル `users` → REQ-001 と紐付け
- 例: エンドポイント `POST /auth/login` → REQ-001 と紐付け

## 品質判定基準

```
✅ 高品質:
- 設計の完全性: 完全
- 技術的実現可能性: 確実
- パフォーマンス・スケーラビリティ: 考慮済み
- セキュリティ考慮: 十分
- 信頼性レベル: 🔵（青信号）が80%以上

⚠️ 要改善:
- 設計に曖昧な部分がある
- 技術的制約が不明確
- パフォーマンス考慮が不十分
- セキュリティリスクが残る
- 信頼性レベル: 🟡🔴（黄・赤信号）が20%以上
```

## TODO更新パターン

```
- 設計フェーズを「completed」にマーク
- 次のフェーズ「タスク分割（beam4-tasks）」をTODOに追加
- 品質判定結果をTODO内容に記録
```

## 信頼性レベル指示

各項目について、**情報源との照合状況**を以下の信号でコメントする：

| 信号 | 意味 |
|---|---|
| 🔵 **青信号** | 情報源（PRD・タスクノート・要件定義書・**既存の**設計文書・ユーザヒアリング応答・CLAUDE.md）に明示的な記載があり、ほぼ推測していない |
| 🟡 **黄信号** | 情報源から妥当な推測ができる場合（明示的記載は無いが、文脈から導ける） |
| 🔴 **赤信号** | 情報源に無い推測（実装側の判断・一般的なベストプラクティスの適用など） |

**情報源の定義**:
- PRD (`docs/spec/{要件名}/product-requirements.md`)
- タスクノート (`docs/spec/{要件名}/note.md`)
- 要件定義書 (`docs/spec/{要件名}/requirements.md`)
- 関連文書 (`user-stories.md`, `acceptance-criteria.md`, `interview-record.md`, `prep.md`)
- **既存の**設計文書 (本スキル実行**前**から存在するもの — 旧 `docs/design/` 配下や、別ブランチ・別バージョンの設計)
- 本スキル実行中の AskUserQuestion による応答
- CLAUDE.md / README.md などのプロジェクトメタ情報

**注意**: 本スキルが**今まさに作成中**の `architecture.md` / `dataflow.md` / `interfaces.ts` 等は情報源に含めない（自己参照を避けるため）。

## ファイルパスの記載ルール

- **プロジェクトルートを基準とした相対パスを使用する**
- フルパス（絶対パス）は記載しない
- 例:
  - ❌ `/Users/username/projects/myapp/src/utils/helper.ts`
  - ✅ `src/utils/helper.ts`

- **設計文書内の相互リンク**は `docs/spec/{要件名}/design/` 内の相対パスを使用:
  - 同じディレクトリ内: `[architecture.md](architecture.md)`
  - 親ディレクトリの要件定義書: `[requirements.md](../requirements.md)`
  - 親ディレクトリの PRD: `[product-requirements.md](../product-requirements.md)`

## 作業規模別の出力調整

### フル機能開発

- すべてのファイルを生成
- 詳細なアーキテクチャ設計
- 包括的なデータフロー図
- 完全な型定義・DBスキーマ・API仕様

### 軽量開発

- `architecture.md` と `dataflow.md` と `design-interview.md` のみ
- 基本的なアーキテクチャ概要
- 主要なデータフローのみ

### カスタム

- `architecture.md` と `dataflow.md` と `design-interview.md` は必ず生成
- step2 で選択された項目（`custom_items`）に応じて追加生成
- 必要に応じてファイルを分割

## 既存設計との整合性

- 既存の設計文書（`docs/spec/{要件名}/design/` 配下の既存ファイル、または旧 `docs/design/` 配下）がある場合は必ず参照する
- 既存の型定義パターンに合わせる
- 既存のアーキテクチャパターンとの整合性を保つ
- 変更が必要な場合は理由を明記する

# info

## AskUserQuestion ツールの使用例

すべてのヒアリングは AskUserQuestion ツールを使用して行います。以下は具体的な使用例です。

### アーキテクチャ確認系質問

```
AskUserQuestion({
  questions: [{
    question: "現在のアーキテクチャは{具体的なパターン}ですが、{新要件}には{別のパターン}の方が適している可能性があります。変更を検討しますか？",
    header: "アーキテクチャ",
    multiSelect: false,
    options: [
      { label: "現行維持", description: "現在のアーキテクチャを維持" },
      { label: "変更検討", description: "新しいアーキテクチャパターンを検討" }
    ]
  }]
})
```

### 技術選択系質問（複数選択）

```
AskUserQuestion({
  questions: [{
    question: "この機能で使用する技術を選択してください",
    header: "技術選択",
    multiSelect: true,
    options: [
      { label: "REST API", description: "RESTful API を使用" },
      { label: "GraphQL", description: "GraphQL を使用" },
      { label: "WebSocket", description: "リアルタイム通信が必要" }
    ]
  }]
})
```

### データモデル確認

```
AskUserQuestion({
  questions: [{
    question: "ユーザーデータの保存方法について教えてください",
    header: "データ保存",
    multiSelect: false,
    options: [
      { label: "リレーショナルDB", description: "PostgreSQL/MySQL等を使用" },
      { label: "NoSQL", description: "MongoDB/DynamoDB等を使用" },
      { label: "ハイブリッド", description: "用途に応じて使い分け" }
    ]
  }]
})
```

### パフォーマンス要件確認

```
AskUserQuestion({
  questions: [{
    question: "APIレスポンスタイムの目標値を教えてください",
    header: "レスポンス目標",
    multiSelect: false,
    options: [
      { label: "100ms以内", description: "高速レスポンスが必要" },
      { label: "500ms以内", description: "一般的なレスポンス" },
      { label: "1秒以内", description: "許容範囲内" }
    ]
  }]
})
```

### 優先順位確認（複数質問）

```
AskUserQuestion({
  questions: [
    {
      question: "以下の設計要素の中で、Phase 1（必須）の項目を選択してください",
      header: "Phase 1",
      multiSelect: true,
      options: [
        { label: "ユーザー認証", description: "認証・認可機能" },
        { label: "データ管理", description: "CRUD操作" },
        { label: "レポート機能", description: "データの集計・出力" }
      ]
    },
    {
      question: "設計のフェーズ分けについて教えてください",
      header: "フェーズ計画",
      multiSelect: false,
      options: [
        { label: "一括設計", description: "すべての設計を一度に実施" },
        { label: "段階的設計", description: "フェーズごとに段階的に設計" }
      ]
    }
  ]
})
```

### 注意事項

- **header** は12文字以内の短いラベル
- **question** は明確で具体的な質問文
- **options** は2-4個の選択肢
- **multiSelect** は複数選択可能にする場合 true
- ユーザーは常に「その他」を選択して自由記述できる（自動付与される）
