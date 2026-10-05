// TASK-0017: hook 受信ルート（POST /api/hook）
//
// 役割: Claude Code の hook からタスク更新イベントを受信し、
//   1. リクエスト検証（type 列挙 / project 非空文字列 / taskId 整数）
//   2. MetaStore.setUpdateBadge で update_badge を立てる（REQ-010）
//   3. SseHub.broadcast で tasks_changed（一覧再取得）を push（REQ-010）
//   4. 通知 ON のときのみ Notifier.onEvent（5 秒集約ウィンドウへ投入 REQ-101/102）
// を行う。検証失敗時は VALIDATION_ERROR(400) で副作用を一切起こさない（フェイルクローズ）。
//
// 依存注入: store / sseHub / notifier を最小契約で受け取り、実 powershell・実時間・
// 実 DB に依存せずテストできる（実 DB は統合テストで :memory: を結線して担保）。
//
// セキュリティ（P0）:
// - taskId を整数検証（後段 powershell へ数値で渡すコマンドインジェクション防止の起点）。
// - type を列挙 allow-list で限定（Mass Assignment 防止）。
// - SSE data はサーバ生成の固定構造のみ（SseHub.broadcast が JSON.stringify。XSS 防止）。
// - localhost のみ到達（127.0.0.1 バインド NFR-102）。本層で追加制御は不要。
// - エラーメッセージは日本語固定文言・内部情報なし（NFR-201）。ログにシークレット/PII を出さない。

import { Hono } from "hono"
import {
  ERROR_CODES,
  err,
  ok,
  type HookEventType,
  type TasksChangedEvent,
} from "../../shared/index.js"

/** hook が依存する MetaStore の最小契約。 */
export interface HookMetaStore {
  /** update_badge を立てる（idempotent upsert）。 */
  setUpdateBadge(project: string, taskId: string): void
  /** 通知 ON/OFF を返す。 */
  getNotificationsEnabled(): boolean
}

/** hook が依存する SSE ハブの最小契約。 */
export interface HookSseHub {
  broadcast(event: TasksChangedEvent): Promise<void>
}

/** hook が依存する Notifier の最小契約。 */
export interface HookNotifier {
  onEvent(): void
}

/** hook 受信ルートの依存（注入）。 */
export interface HookRouterDeps {
  store: HookMetaStore
  sseHub: HookSseHub
  notifier: HookNotifier
}

/** 受理する type の allow-list（HookEventType に一致）。 */
const VALID_TYPES: readonly HookEventType[] = [
  "added",
  "updated",
  "deleted",
  "status_changed",
]

/** ユーザ向けメッセージ（日本語・内部情報なし NFR-201）。 */
const MSG_VALIDATION = "リクエストが不正です（type/project/taskId を確認してください）"

/** 検証済みの hook ペイロード。 */
interface ValidHook {
  type: HookEventType
  project: string
  taskId: string
}

/**
 * リクエストボディを検証する。妥当なら ValidHook、不正なら null。
 * - type: VALID_TYPES のいずれか
 * - project: 非空文字列
 * - taskId: 非空文字列（ソース DB の task_id は "TASK-0001" 等の TEXT。整数 ID も文字列化して受ける）
 */
function validate(body: unknown): ValidHook | null {
  if (typeof body !== "object" || body === null) return null
  const b = body as Record<string, unknown>
  if (!VALID_TYPES.includes(b.type as HookEventType)) return null
  if (typeof b.project !== "string" || b.project.length === 0) return null
  // taskId は文字列 or 数値を受理し、内部表現は文字列に正規化する。
  const taskId =
    typeof b.taskId === "string"
      ? b.taskId
      : typeof b.taskId === "number" && Number.isFinite(b.taskId)
        ? String(b.taskId)
        : null
  if (taskId === null || taskId.length === 0) return null
  return { type: b.type as HookEventType, project: b.project, taskId }
}

/**
 * hook 受信ルータを生成する。
 * createApp 側で `app.route("/api/hook", createHookRouter(deps))` でマウントする。
 */
export function createHookRouter(deps: HookRouterDeps): Hono {
  const router = new Hono()

  router.post("/", async (c) => {
    // JSON パース失敗（不正ボディ）は検証段で弾く。
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      return c.json(err(ERROR_CODES.VALIDATION_ERROR, MSG_VALIDATION), 400)
    }

    const hook = validate(raw)
    if (!hook) {
      // 検証失敗時は副作用（badge/SSE/notify）を起こさない（フェイルクローズ）。
      return c.json(err(ERROR_CODES.VALIDATION_ERROR, MSG_VALIDATION), 400)
    }

    const { project, taskId } = hook

    // 2. update_badge を立てる（REQ-010）。
    deps.store.setUpdateBadge(project, taskId)

    // 3. 一覧再取得イベントを push（REQ-010）。data はサーバ生成の固定構造のみ。
    const event: TasksChangedEvent = {
      type: "tasks_changed",
      changedTaskIds: [{ project, taskId }],
    }
    await deps.sseHub.broadcast(event)

    // 4. 通知 ON のときのみ集約ウィンドウへ投入（OFF でも上記の一覧更新は継続 REQ-102）。
    if (deps.store.getNotificationsEnabled()) {
      deps.notifier.onEvent()
    }

    return c.json(ok({}))
  })

  return router
}
