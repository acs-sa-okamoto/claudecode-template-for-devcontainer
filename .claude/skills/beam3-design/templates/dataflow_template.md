# {要件名} データフロー図

**作成日**: {作成日時}
**関連アーキテクチャ**: [architecture.md](architecture.md)
**関連要件定義**: [requirements.md](../requirements.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: PRD・要件定義書・既存の設計文書・ユーザヒアリングを参考にした確実なフロー
- 🟡 **黄信号**: PRD・要件定義書・既存の設計文書・ユーザヒアリングから妥当な推測によるフロー
- 🔴 **赤信号**: PRD・要件定義書・既存の設計文書・ユーザヒアリングにない推測によるフロー

---

## システム全体のデータフロー 🔵

**信頼性**: 🔵 *要件定義・ユーザーストーリーより*

```mermaid
flowchart TD
    A[ユーザー] --> B[フロントエンド]
    B --> C[API Gateway]
    C --> D[バックエンド]
    D --> E[(データベース)]
    D --> F[(キャッシュ)]
    D --> G[外部サービス]

    E --> D
    F --> D
    G --> D
    D --> C
    C --> B
    B --> A
```

## 主要機能のデータフロー

### 機能1: {機能名} 🔵

**信頼性**: 🔵 *ユーザーストーリー1.1・受け入れ基準TC-001より*

**関連要件**: REQ-001, REQ-002

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant F as フロントエンド
    participant A as API
    participant B as バックエンド
    participant D as データベース

    U->>F: {アクション}
    F->>A: POST /api/{endpoint}
    A->>B: {処理}
    B->>D: {クエリ}
    D-->>B: {結果}
    B->>B: {ビジネスロジック}
    B-->>A: {レスポンス}
    A-->>F: {データ}
    F-->>U: {画面更新}
```

**詳細ステップ**:
1. {ステップ1の詳細説明}
2. {ステップ2の詳細説明}
3. {ステップ3の詳細説明}

### 機能2: {機能名} 🟡

**信頼性**: 🟡 *要件から妥当な推測*

**関連要件**: REQ-101

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant F as フロントエンド
    participant B as バックエンド
    participant C as キャッシュ
    participant D as データベース

    U->>F: {アクション}
    F->>B: GET /api/{endpoint}
    B->>C: キャッシュ確認
    alt キャッシュヒット
        C-->>B: キャッシュデータ
    else キャッシュミス
        B->>D: クエリ実行
        D-->>B: データ取得
        B->>C: キャッシュ更新
    end
    B-->>F: レスポンス
    F-->>U: 表示更新
```

**備考**: {この推測の根拠や確認が必要な理由}

## データ処理パターン

### 同期処理 🔵

**信頼性**: 🔵 *アーキテクチャ設計より*

{同期処理が必要な機能とその理由}

### 非同期処理 🟡

**信頼性**: 🟡 *パフォーマンス要件から妥当な推測*

{非同期処理が必要な機能とその理由}

### バッチ処理 🟡

**信頼性**: 🟡 *要件から妥当な推測*

{バッチ処理が必要な機能とその理由}

## エラーハンドリングフロー 🟡

**信頼性**: 🟡 *既存実装パターンから妥当な推測*

```mermaid
flowchart TD
    A[エラー発生] --> B{エラー種別}
    B -->|バリデーションエラー| C[400 Bad Request]
    B -->|認証エラー| D[401 Unauthorized]
    B -->|権限エラー| E[403 Forbidden]
    B -->|リソース未存在| F[404 Not Found]
    B -->|サーバーエラー| G[500 Internal Server Error]

    C --> H[エラーメッセージ返却]
    D --> H
    E --> H
    F --> H
    G --> I[ログ記録]
    I --> H
    H --> J[フロントエンドでエラー表示]
```

## 状態管理フロー

### フロントエンド状態管理 🔵

**信頼性**: 🔵 *tech-stack.md・既存実装より*

```mermaid
stateDiagram-v2
    [*] --> 初期状態
    初期状態 --> ローディング: データ取得開始
    ローディング --> 成功: データ取得成功
    ローディング --> エラー: データ取得失敗
    成功 --> ローディング: 再取得
    エラー --> ローディング: リトライ
```

### バックエンド状態管理 🟡

**信頼性**: 🟡 *要件から妥当な推測*

{状態管理の詳細}

## データ整合性の保証 🟡

**信頼性**: 🟡 *NFR要件から妥当な推測*

- **トランザクション管理**: {トランザクション戦略}
- **楽観的ロック/悲観的ロック**: {ロック戦略}
- **整合性チェック**: {整合性確認方法}

## 関連文書

- **アーキテクチャ**: [architecture.md](architecture.md)
- **ヒアリング記録**: [design-interview.md](design-interview.md)
- **型定義** （フル機能開発時のみ）: [interfaces.ts](interfaces.ts)
- **DBスキーマ** （フル機能開発時のみ）: [database-schema.sql](database-schema.sql)
- **API仕様** （フル機能開発時のみ）: [api-endpoints.md](api-endpoints.md)
- **要件定義**: [requirements.md](../requirements.md)
- **PRD**: [product-requirements.md](../product-requirements.md)

## 信頼性レベルサマリー

- 🔵 青信号: {件数}件 ({割合}%)
- 🟡 黄信号: {件数}件 ({割合}%)
- 🔴 赤信号: {件数}件 ({割合}%)

**品質評価**: {高品質/要改善/要ヒアリング}
