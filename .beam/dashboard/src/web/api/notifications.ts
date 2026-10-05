// 通知設定 API クライアント。GET/POST /api/notifications。

import type { ToggleNotificationsRequest } from "../../shared/index.js"
import { apiFetch } from "./client.js"

/** GET /api/notifications のレスポンス data。 */
interface NotificationsData {
  notificationsEnabled: boolean
}

/** 現在の通知 ON/OFF を取得する。 */
export async function getNotifications(
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const data = await apiFetch<NotificationsData>(
    "/api/notifications",
    undefined,
    fetchImpl,
  )
  return data.notificationsEnabled
}

/** 通知 ON/OFF を切り替える。サーバが返す確定値を返す。 */
export async function setNotifications(
  enabled: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const payload: ToggleNotificationsRequest = { enabled }
  const data = await apiFetch<NotificationsData>(
    "/api/notifications",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    fetchImpl,
  )
  return data.notificationsEnabled
}
