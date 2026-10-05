// 通知 ON/OFF トグル UI。
//
// 初期表示で GET /api/notifications を取得しトグルへ反映、切替時に POST /api/notifications
// で更新する。失敗時はトグル状態を元に戻しエラーを表示する（サーバが正本・AC-16）。
// ON にした瞬間（ユーザー操作起点）にブラウザ通知の許可を要求する（方式B）。
//
// XSS（P0）: ラベルは固定日本語。値は textContent。

import { ApiError } from "../api/client.js"
import { getNotifications, setNotifications } from "../api/notifications.js"
import { el } from "../dom.js"
import { ensureNotificationPermission } from "../notify/notify.js"

/** トグル生成の依存（テストで fetch / onError / 許可要求を注入）。 */
export interface NotificationToggleDeps {
  fetchImpl?: typeof fetch
  onError?: (error: ApiError) => void
  /** 通知 ON 時のブラウザ通知許可要求（既定 ensureNotificationPermission）。テストで注入。 */
  requestPermission?: () => Promise<NotificationPermission>
}

/** トグル要素と初期化関数を返す。 */
export interface NotificationToggle {
  /** ラベル + checkbox を内包する要素。 */
  element: HTMLElement
  /** checkbox 要素（テスト・操作用）。 */
  input: HTMLInputElement
  /** GET で初期状態を取得して反映する。 */
  init: () => Promise<void>
}

/**
 * 通知トグルを生成する。change で POST、失敗時はロールバック（AC-16）。
 * ON 時はブラウザ通知の許可を要求する（方式B）。
 */
export function createNotificationToggle(
  deps: NotificationToggleDeps = {},
): NotificationToggle {
  const fetchImpl = deps.fetchImpl ?? fetch
  const requestPermission = deps.requestPermission ?? ensureNotificationPermission

  const input = el("input", {
    attrs: { type: "checkbox", "data-testid": "notif-toggle" },
  })
  // 取得完了までは無効化（UI/UX）。
  input.disabled = true

  const labelText = el("span", { text: "通知" })
  const element = el("label", {
    className: "notif-toggle",
    attrs: { "aria-label": "通知の ON/OFF" },
    children: [input, labelText],
  })

  input.addEventListener("change", () => {
    const desired = input.checked
    // ON にした瞬間（ユーザー操作起点）にブラウザ通知の許可を要求する（方式B）。
    if (desired) void requestPermission()
    input.disabled = true
    void setNotifications(desired, fetchImpl)
      .then((confirmed) => {
        // サーバ確定値で同期する。
        input.checked = confirmed
      })
      .catch((error: unknown) => {
        // 失敗時はトグルを元に戻す（UI/UX）。
        input.checked = !desired
        if (error instanceof ApiError && deps.onError) deps.onError(error)
      })
      .finally(() => {
        input.disabled = false
      })
  })

  const init = async (): Promise<void> => {
    try {
      const enabled = await getNotifications(fetchImpl)
      input.checked = enabled
    } catch (error) {
      if (error instanceof ApiError && deps.onError) deps.onError(error)
    } finally {
      input.disabled = false
    }
  }

  return { element, input, init }
}
