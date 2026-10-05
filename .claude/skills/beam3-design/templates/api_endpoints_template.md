# {要件名} API エンドポイント仕様

**作成日**: {作成日時}
**関連設計**: [architecture.md](architecture.md)
**関連要件定義**: [requirements.md](../requirements.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: PRD・要件定義書・既存の設計文書・ユーザヒアリングを参考にした確実な定義
- 🟡 **黄信号**: PRD・要件定義書・既存の設計文書・ユーザヒアリングから妥当な推測による定義
- 🔴 **赤信号**: PRD・要件定義書・既存の設計文書・ユーザヒアリングにない推測による定義

---

## 共通仕様

### ベースURL 🔵

**信頼性**: 🔵 *既存API仕様より*

```
{base_url}/api/v1
```

### 認証 🔵

**信頼性**: 🔵 *アーキテクチャ設計・既存API仕様より*

すべてのエンドポイント（一部の公開エンドポイントを除く）は認証が必要です。

```http
Authorization: Bearer {jwt_token}
```

### エラーレスポンス共通フォーマット 🔵

**信頼性**: 🔵 *既存API仕様の共通パターンより*

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "エラーメッセージ",
    "details": {}
  }
}
```

### ページネーション 🔵

**信頼性**: 🔵 *既存API仕様の共通パターンより*

リストを返すエンドポイントはページネーションをサポートします。

**クエリパラメータ**:
- `page`: ページ番号（デフォルト: 1）
- `limit`: 1ページあたりの件数（デフォルト: 20、最大: 100）

**レスポンス形式**:
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

---

## エンドポイント一覧

### 認証

#### POST /auth/login 🔵

**信頼性**: 🔵 *要件定義REQ-001・受け入れ基準TC-001より*

**関連要件**: REQ-001

**説明**: ユーザーログイン

**リクエスト**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "data": {
    "token": "jwt-token-here",
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "name": "User Name"
    }
  }
}
```

**エラーコード**:
- `INVALID_CREDENTIALS`: 認証情報が無効
- `ACCOUNT_LOCKED`: アカウントがロックされている

---

#### POST /auth/logout 🔵

**信頼性**: 🔵 *要件定義REQ-002より*

**関連要件**: REQ-002

**説明**: ユーザーログアウト

**リクエスト**: なし

**レスポンス（成功）**:
```json
{
  "success": true
}
```

---

### {リソース名1}

#### GET /{resource1} 🔵

**信頼性**: 🔵 *要件定義REQ-101・API仕様より*

**関連要件**: REQ-101

**説明**: {リソース}一覧取得

**クエリパラメータ**:
- `page` (optional): ページ番号
- `limit` (optional): 1ページあたりの件数
- `{filter_param}` (optional): フィルター条件

**レスポンス（成功）**:
```json
{
  "success": true,
  "data": [
    {
      "id": "resource-id",
      "field1": "value1",
      "field2": "value2",
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

---

#### GET /{resource1}/:id 🔵

**信頼性**: 🔵 *要件定義REQ-102・受け入れ基準TC-102より*

**関連要件**: REQ-102

**説明**: {リソース}詳細取得

**パスパラメータ**:
- `id`: リソースID

**レスポンス（成功）**:
```json
{
  "success": true,
  "data": {
    "id": "resource-id",
    "field1": "value1",
    "field2": "value2",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z"
  }
}
```

**エラーコード**:
- `RESOURCE_NOT_FOUND`: リソースが見つからない

---

#### POST /{resource1} 🔵

**信頼性**: 🔵 *要件定義REQ-103・受け入れ基準TC-103より*

**関連要件**: REQ-103

**説明**: {リソース}作成

**リクエスト**:
```json
{
  "field1": "value1",
  "field2": "value2"
}
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "data": {
    "id": "new-resource-id",
    "field1": "value1",
    "field2": "value2",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z"
  }
}
```

**エラーコード**:
- `VALIDATION_ERROR`: バリデーションエラー
- `DUPLICATE_RESOURCE`: 重複エラー

---

#### PUT /{resource1}/:id 🟡

**信頼性**: 🟡 *要件から妥当な推測*

**関連要件**: REQ-104

**説明**: {リソース}更新

**備考**: {確認が必要な理由}

**パスパラメータ**:
- `id`: リソースID

**リクエスト**:
```json
{
  "field1": "updated-value1",
  "field2": "updated-value2"
}
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "data": {
    "id": "resource-id",
    "field1": "updated-value1",
    "field2": "updated-value2",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T12:00:00Z"
  }
}
```

**エラーコード**:
- `RESOURCE_NOT_FOUND`: リソースが見つからない
- `VALIDATION_ERROR`: バリデーションエラー

---

#### DELETE /{resource1}/:id 🔵

**信頼性**: 🔵 *要件定義REQ-105より*

**関連要件**: REQ-105

**説明**: {リソース}削除

**パスパラメータ**:
- `id`: リソースID

**レスポンス（成功）**:
```json
{
  "success": true
}
```

**エラーコード**:
- `RESOURCE_NOT_FOUND`: リソースが見つからない
- `RESOURCE_IN_USE`: リソースが使用中のため削除不可

---

## レート制限 🟡

**信頼性**: 🟡 *NFR要件から妥当な推測*

- 認証済みユーザー: {制限値}/分
- 未認証ユーザー: {制限値}/分

レート制限超過時のレスポンス:
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "レート制限を超過しました",
    "details": {
      "retryAfter": 60
    }
  }
}
```

## バージョニング 🔵

**信頼性**: 🔵 *既存API仕様より*

APIバージョンはURLパスに含めます（例: `/api/v1/`）。

## CORS設定 🔵

**信頼性**: 🔵 *セキュリティ設計より*

許可されたオリジン: {allowed_origins}

## 関連文書

- **アーキテクチャ**: [architecture.md](architecture.md)
- **データフロー**: [dataflow.md](dataflow.md)
- **ヒアリング記録**: [design-interview.md](design-interview.md)
- **型定義**: [interfaces.ts](interfaces.ts)
- **DBスキーマ**: [database-schema.sql](database-schema.sql)
- **要件定義**: [requirements.md](../requirements.md)
- **PRD**: [product-requirements.md](../product-requirements.md)

## 信頼性レベルサマリー

- 🔵 青信号: {件数}件 ({割合}%)
- 🟡 黄信号: {件数}件 ({割合}%)
- 🔴 赤信号: {件数}件 ({割合}%)

**品質評価**: {高品質/要改善/要ヒアリング}