# {要件名} 型定義

**作成日**: {作成日時}
**関連設計**: [architecture.md](architecture.md)
**関連要件定義**: [requirements.md](../requirements.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: PRD・要件定義書・既存の設計文書・ユーザヒアリングを参考にした確実な定義
- 🟡 **黄信号**: PRD・要件定義書・既存の設計文書・ユーザヒアリングから妥当な推測による定義
- 🔴 **赤信号**: PRD・要件定義書・既存の設計文書・ユーザヒアリングにない推測による定義

// ========================================
// エンティティ定義
// ========================================

/**
 * {エンティティ名}
 * 🔵 信頼性: 要件定義REQ-001・DBスキーマより
 */
export interface {EntityName} {
  id: string; // 🔵 DBスキーマより
  {field1}: {type1}; // 🔵 要件定義より
  {field2}: {type2}; // 🟡 既存実装から妥当な推測
  createdAt: Date; // 🔵 共通パターン
  updatedAt: Date; // 🔵 共通パターン
}

/**
 * {エンティティ名2}
 * 🟡 信頼性: 要件から妥当な推測
 * 備考: {確認が必要な理由}
 */
export interface {EntityName2} {
  id: string; // 🔵 DBスキーマより
  {field1}: {type1}; // 🟡 要件から推測
  // ... 他のフィールド
}

// ========================================
// APIリクエスト/レスポンス
// ========================================

/**
 * {機能名} リクエスト
 * 🔵 信頼性: API仕様書・受け入れ基準TC-001より
 */
export interface {FunctionName}Request {
  {param1}: {type1}; // 🔵 API仕様より
  {param2}: {type2}; // 🔵 受け入れ基準より
  // ... 他のパラメータ
}

/**
 * {機能名} レスポンス
 * 🔵 信頼性: API仕様書より
 */
export interface {FunctionName}Response {
  success: boolean; // 🔵 共通パターン
  data?: {DataType}; // 🔵 API仕様より
  error?: ErrorResponse; // 🔵 共通パターン
}

/**
 * エラーレスポンス
 * 🔵 信頼性: 既存実装の共通パターンより
 */
export interface ErrorResponse {
  code: string; // 🔵 既存実装より
  message: string; // 🔵 既存実装より
  details?: unknown; // 🔵 既存実装より
}

// ========================================
// 共通型定義
// ========================================

/**
 * ページネーション
 * 🔵 信頼性: 既存実装の共通パターンより
 */
export interface Pagination {
  page: number; // 🔵 既存実装より
  limit: number; // 🔵 既存実装より
  total: number; // 🔵 既存実装より
}

/**
 * APIレスポンス共通型
 * 🔵 信頼性: 既存実装の共通パターンより
 */
export interface ApiResponse<T> {
  success: boolean; // 🔵 既存実装より
  data?: T; // 🔵 既存実装より
  error?: ErrorResponse; // 🔵 既存実装より
  pagination?: Pagination; // 🔵 既存実装より
}

// ========================================
// 列挙型
// ========================================

/**
 * {列挙型名}
 * 🔵 信頼性: 要件定義・DBスキーマより
 */
export enum {EnumName} {
  {VALUE1} = '{value1}', // 🔵 要件定義より
  {VALUE2} = '{value2}', // 🔵 DBスキーマより
  // ... 他の値
}

// ========================================
// ユーティリティ型
// ========================================

/**
 * 部分的な更新用型
 * 🔵 信頼性: 既存実装の共通パターンより
 */
export type Partial{EntityName} = Partial<{EntityName}>;

/**
 * 作成用型（IDなし）
 * 🔵 信頼性: 既存実装の共通パターンより
 */
export type Create{EntityName}Input = Omit<{EntityName}, 'id' | 'createdAt' | 'updatedAt'>;

// ========================================
// 関連文書
// ========================================
// - アーキテクチャ: ./architecture.md
// - データフロー: ./dataflow.md
// - DBスキーマ: ./database-schema.sql
// - API仕様: ./api-endpoints.md
// - 要件定義: ../requirements.md

// ========================================
// 信頼性レベルサマリー
// ========================================
/**
 * - 🔵 青信号: {件数}件 ({割合}%)
 * - 🟡 黄信号: {件数}件 ({割合}%)
 * - 🔴 赤信号: {件数}件 ({割合}%)
 *
 * 品質評価: {高品質/要改善/要ヒアリング}
 */
