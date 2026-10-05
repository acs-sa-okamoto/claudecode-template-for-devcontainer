// API クライアント基盤。
//
// すべての API 呼び出しは同一オリジン（127.0.0.1:3939）の `/api/*` に対して行い、
// 共通レスポンス ApiResponse<T> を解釈する。フロントから DB へ直接接続せず必ず API 経由
// （P1 / NFR）。シークレットはクライアントに含めない（認証なし個人利用・localhost）。

import type { ApiResponse } from "../../shared/index.js"

/** API がエラー応答（success:false）または HTTP エラーを返したことを表す。 */
export class ApiError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = "ApiError"
    this.code = code
  }
}

/**
 * `ApiResponse<T>` を返す JSON エンドポイントを呼び出し、成功なら data を返す。
 * success:false / HTTP エラー / パース失敗は ApiError を throw する（フェイルクローズ）。
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  let res: Response
  try {
    res = await fetchImpl(path, init)
  } catch {
    // ネットワーク到達不可。詳細は内部に出さずフェイルクローズ。
    throw new ApiError("DB_CONNECTION_FAILED", "サーバーに接続できません。")
  }

  let body: ApiResponse<T>
  try {
    body = (await res.json()) as ApiResponse<T>
  } catch {
    throw new ApiError("DB_CONNECTION_FAILED", "応答の解析に失敗しました。")
  }

  if (!body.success || body.data === undefined) {
    const code = body.error?.code ?? "DB_CONNECTION_FAILED"
    const message = body.error?.message ?? "不明なエラーが発生しました。"
    throw new ApiError(code, message)
  }
  return body.data
}
