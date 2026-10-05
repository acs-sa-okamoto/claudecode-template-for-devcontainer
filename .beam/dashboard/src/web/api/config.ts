// クライアント設定 API。GET /api/config から動作モード（view/full）を取得する。

import { apiFetch } from "./client.js"

/** サーバーの動作モード。 */
export type DashboardMode = "full" | "view"

interface ConfigResponse {
  mode: DashboardMode
}

/**
 * GET /api/config を取得して動作モードを返す。
 * 取得失敗時は "full" を既定として返す（バッジを出さない安全側）。
 */
export async function fetchMode(
  fetchImpl: typeof fetch = fetch,
): Promise<DashboardMode> {
  try {
    const data = await apiFetch<ConfigResponse>(
      "/api/config",
      undefined,
      fetchImpl,
    )
    return data.mode === "view" ? "view" : "full"
  } catch {
    return "full"
  }
}
