// ブラウザ通知（方式B）。
//
// SSE の tasks_changed をブラウザ側で集約し、ホスト常駐や powershell.exe に依存せず
// Web Notifications で「N件のタスクが更新されました」を表示する。
// 通知 ON/OFF（通知トグル＝サーバ設定）と通知許可（Notification.permission）でゲートする。
//
// XSS/PII（P0/NFR-104）: 本文はサーバ生成イベント由来の「件数」のみ。タスク本文・トークン等は含めない。

/** 変更されたタスクの識別子。 */
export interface ChangedTask {
  project: string
  taskId: string
}

/** ブラウザ通知器の依存（テストで注入可能）。 */
export interface BrowserNotifierDeps {
  /** 通知が ON か（通知トグルの現在値）。 */
  isEnabled: () => boolean
  /** 集約ウィンドウ（ms。既定 5000）。 */
  windowMs?: number
  /** 許可状態の取得（既定 Notification.permission）。テストで注入。 */
  getPermission?: () => NotificationPermission
  /** 実際の表示（既定 new Notification）。テストで注入し実 API 非依存にする。 */
  show?: (title: string, body: string) => void
  /** setTimeout 注入（テスト用）。 */
  setTimeoutFn?: (cb: () => void, ms: number) => unknown
}

/** ブラウザ通知器。 */
export interface BrowserNotifier {
  /** tasks_changed の変更分を投入する（集約され、満了時に1件通知）。 */
  onChange: (changed: ChangedTask[]) => void
}

const NOTIF_TITLE = "タスク更新"

function defaultGetPermission(): NotificationPermission {
  return typeof Notification !== "undefined" ? Notification.permission : "denied"
}

function defaultShow(title: string, body: string): void {
  if (
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  ) {
    // body は固定文＋件数のみ（XSS/PII なし）。
    new Notification(title, { body })
  }
}

/**
 * ブラウザ通知器を生成する。tasks_changed をウィンドウ内で集約し、満了時に
 * 「通知 ON かつ許可済み」のときだけ1件のブラウザ通知を出す（判定は満了時点）。
 */
export function createBrowserNotifier(deps: BrowserNotifierDeps): BrowserNotifier {
  const windowMs = deps.windowMs ?? 5000
  const getPermission = deps.getPermission ?? defaultGetPermission
  const show = deps.show ?? defaultShow
  const schedule = deps.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms))

  const keys = new Set<string>()
  let scheduled = false

  const flush = (): void => {
    scheduled = false
    const count = keys.size
    keys.clear()
    if (count <= 0) return
    // 判定は満了時点（途中で OFF/不許可になった場合は出さない）。
    if (!deps.isEnabled()) return
    if (getPermission() !== "granted") return
    show(NOTIF_TITLE, `${count}件のタスクが更新されました`)
  }

  const onChange = (changed: ChangedTask[]): void => {
    for (const c of changed) keys.add(`${c.project}\t${c.taskId}`)
    if (scheduled) return
    scheduled = true
    schedule(flush, windowMs)
  }

  return { onChange }
}

/**
 * 通知許可を必要に応じて要求する。ブラウザの制約上、ユーザー操作（トグル ON）起点で呼ぶこと。
 * 既に granted/denied なら現状を返す。Notification 非対応環境では "denied"。
 */
export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied"
  if (Notification.permission === "default") {
    try {
      return await Notification.requestPermission()
    } catch {
      return Notification.permission
    }
  }
  return Notification.permission
}
