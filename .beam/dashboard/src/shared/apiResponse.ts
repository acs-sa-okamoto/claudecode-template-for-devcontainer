// ApiResponse 生成ヘルパー（TASK-0005）
//
// api-endpoints.md の共通レスポンスフォーマットに一致する成功/エラーを生成する。
//   成功: { success: true, data }
//   エラー: { success: false, error: { code, message } }

import type { ErrorCode } from "./errorCodes.js"
import type { ApiResponse } from "./interfaces.js"

/** 成功レスポンスを生成する。 */
export const ok = <T>(data: T): ApiResponse<T> => ({ success: true, data })

/** エラーレスポンスを生成する。code は ERROR_CODES の定数を使う。 */
export const err = (
  code: ErrorCode,
  message: string,
): ApiResponse<never> => ({
  success: false,
  error: { code, message },
})
