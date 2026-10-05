// TASK-0018: 通知設定ルート（GET/POST /api/notifications）
//
// 役割: 通知 ON/OFF の取得（GET）と切替・永続化（POST）を提供する。
// 永続化は MetaStore.setNotificationsEnabled に委譲し、本層で settings を再実装しない。
//   - GET  /api/notifications        → { notificationsEnabled }
//   - POST /api/notifications {enabled} → 検証 → 永続化 → 切替後値を返す
//
// 依存注入: store（getNotificationsEnabled / setNotificationsEnabled の最小契約）を受け取り、
// 実 DB を直接 import しない（非依存テストが可能。統合は :memory: MetaStore で担保）。
//
// セキュリティ（P0）:
// - enabled を boolean 検証（型不正は VALIDATION_ERROR・400。allow-list 的に boolean のみ受理）。
// - localhost のみ到達（127.0.0.1 バインド NFR-102）。本層で追加制御は不要。
// - SQL は本層で書かず、MetaStore（Prepared Statement 済み）経由のみ。
// - 出力は JSON のみ（c.json でエスケープ）。エラーメッセージは日本語固定文言（NFR-201）。
// - 通知 ON/OFF は機密でないため、本層は独自ログを持たない（PII/シークレット漏えいの余地なし）。

import { Hono } from "hono"
import { ERROR_CODES, err, ok } from "../../shared/index.js"

/** notifications が依存する MetaStore の最小契約。 */
export interface NotificationsMetaStore {
  getNotificationsEnabled(): boolean
  setNotificationsEnabled(enabled: boolean): void
}

/** 通知設定ルートの依存（注入）。 */
export interface NotificationsRouterDeps {
  store: NotificationsMetaStore
}

/** ユーザ向けメッセージ（日本語・内部情報なし NFR-201）。 */
const MSG_VALIDATION = "enabled は真偽値（true/false）で指定してください"

/**
 * 通知設定ルータを生成する。
 * createApp 側で `app.route("/api/notifications", createNotificationsRouter(deps))` でマウントする。
 */
export function createNotificationsRouter(
  deps: NotificationsRouterDeps,
): Hono {
  const router = new Hono()

  // 現在の ON/OFF を取得する。
  router.get("/", (c) => {
    return c.json(ok({ notificationsEnabled: deps.store.getNotificationsEnabled() }))
  })

  // ON/OFF を切り替えて永続化する。
  router.post("/", async (c) => {
    // JSON パース失敗（不正ボディ）は検証段で弾く。
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      return c.json(err(ERROR_CODES.VALIDATION_ERROR, MSG_VALIDATION), 400)
    }

    // enabled は boolean のみ受理（型不正・欠落は拒否＝フェイルクローズ）。
    const enabled = (raw as Record<string, unknown> | null)?.enabled
    if (typeof enabled !== "boolean") {
      return c.json(err(ERROR_CODES.VALIDATION_ERROR, MSG_VALIDATION), 400)
    }

    deps.store.setNotificationsEnabled(enabled)
    // 切替後の値を返す（永続化結果を再読込して整合を保つ）。
    return c.json(ok({ notificationsEnabled: deps.store.getNotificationsEnabled() }))
  })

  return router
}
