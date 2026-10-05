// 共通エラーコード定数（TASK-0005）
//
// api-endpoints.md の「主なエラーコード」を定数化する。
// マジック文字列を避け、定数経由でのみ利用すること（TASK-0005 注意事項）。

/** API エラーコードの定数集。 */
export const ERROR_CODES = {
  /** ソース DB に接続できない（REQ-112 / AC-20）。 */
  DB_CONNECTION_FAILED: "DB_CONNECTION_FAILED",
  /** Notion 連携が3回リトライ後も失敗（REQ-109）。 */
  NOTION_SYNC_FAILED: "NOTION_SYNC_FAILED",
  /** リクエスト不正（hook など）。 */
  VALIDATION_ERROR: "VALIDATION_ERROR",
  /** 対象タスク／プロジェクト／ジョブが存在しない。 */
  NOT_FOUND: "NOT_FOUND",
} as const

/** エラーコードのユニオン型。 */
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]
