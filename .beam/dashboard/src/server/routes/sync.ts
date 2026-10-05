// TASK-0016: 同期系ルート（個別同期 / 削除同期 / 一括同期）
//
// 役割: Phase 3 のオーケストレーター（syncOne / syncDelete / SyncBatchRunner）を
// Hono ルートに結線し、結果を api-endpoints.md のレスポンス形にマッピングする。
//   - POST /tasks/:project/:taskId/sync        → syncOne
//   - POST /tasks/:project/:taskId/delete-sync → syncDelete
//   - POST /projects/:project/sync             → runner.start（即時 jobId 返却 REQ-204）
//
// 依存注入: syncOne / syncDelete / runner を受け取り、実 Notion / 実ソース DB を
// 直接 import しない（実 DB・実 API 非依存テストが可能）。
//
// セキュリティ（P0）:
// - 副作用 API だが localhost のみ到達（サーバは 127.0.0.1 バインド済み NFR-102）。本層で追加制御は不要。
// - taskId はパスから受けるため整数検証する（非整数は VALIDATION_ERROR・400）。
// - SQL は本層で書かず、注入サービス（Prepared Statement 済み）経由のみ。
// - エラーメッセージは日本語固定文言・内部構成情報を含めない（NFR-201）。
// - 出力は JSON のみ（c.json でエスケープ＝XSS 経路なし）。

import { Hono } from "hono"
import {
  ERROR_CODES,
  err,
  ok,
  type SyncJob,
  type SyncResult,
} from "../../shared/index.js"
import type { DeleteSyncResult } from "../services/sync-delete.js"

/** 同期 1 件分の関数（syncOne 互換）。 */
export type SyncOneFn = (target: {
  project: string
  taskId: string
}) => Promise<SyncResult>

/** 削除 1 件分の関数（syncDelete 互換）。 */
export type SyncDeleteFn = (target: {
  project: string
  taskId: string
}) => Promise<DeleteSyncResult>

/** 一括同期ランナーの最小契約（SyncBatchRunner 互換）。 */
export interface BatchRunnerLike {
  start(project: string): SyncJob
  getJob(jobId: string): SyncJob | null
}

/** 同期系ルートの依存（注入）。 */
export interface SyncRouterDeps {
  syncOne: SyncOneFn
  syncDelete: SyncDeleteFn
  runner: BatchRunnerLike
}

/** ユーザ向けメッセージ（日本語・内部情報なし NFR-201）。 */
const MSG_VALIDATION = "taskId が不正です"
const MSG_SYNC_FAILED = "Notionへの登録に失敗しました（3回リトライ後）"
const MSG_DELETE_FAILED = "Notionページの削除に失敗しました（3回リトライ後）"

/**
 * パスパラメータ taskId を検証して返す。空・未指定なら null。
 * ソース DB の task_id は "TASK-0001" 等の TEXT のため文字列として扱う
 * （整数 ID も文字列として受理）。識別子として安全な文字種のみ許可する。
 */
function parseTaskId(raw: string): string | null {
  if (typeof raw !== "string") return null
  const decoded = decodeURIComponent(raw)
  // 英数字・ハイフン・アンダースコアのみ許可（パスインジェクション・想定外文字を排除）。
  if (!/^[A-Za-z0-9_-]+$/.test(decoded)) return null
  return decoded
}

/**
 * 同期系ルータを生成する。
 * createApp 側で `app.route("/api", createSyncRouter(deps))` でマウントする。
 */
export function createSyncRouter(deps: SyncRouterDeps): Hono {
  const router = new Hono()

  // 個別同期（POST /tasks/:project/:taskId/sync）。
  router.post("/tasks/:project/:taskId/sync", async (c) => {
    const project = c.req.param("project")
    const taskId = parseTaskId(c.req.param("taskId"))
    if (taskId === null) {
      return c.json(err(ERROR_CODES.VALIDATION_ERROR, MSG_VALIDATION), 400)
    }
    try {
      const result = await deps.syncOne({ project, taskId })
      // 失敗（sync_failed）は NOTION_SYNC_FAILED に整形。スキップ含むそれ以外は現状を返す。
      if (result.status === "sync_failed") {
        return c.json(err(ERROR_CODES.NOTION_SYNC_FAILED, MSG_SYNC_FAILED))
      }
      return c.json(ok(result))
    } catch {
      // 想定外例外もフェイルクローズで安全側に倒す（プロセス継続・詳細は出さない）。
      return c.json(err(ERROR_CODES.NOTION_SYNC_FAILED, MSG_SYNC_FAILED))
    }
  })

  // 削除同期（POST /tasks/:project/:taskId/delete-sync）。
  router.post("/tasks/:project/:taskId/delete-sync", async (c) => {
    const project = c.req.param("project")
    const taskId = parseTaskId(c.req.param("taskId"))
    if (taskId === null) {
      return c.json(err(ERROR_CODES.VALIDATION_ERROR, MSG_VALIDATION), 400)
    }
    try {
      const result = await deps.syncDelete({ project, taskId })
      if (result.status === "sync_failed") {
        return c.json(err(ERROR_CODES.NOTION_SYNC_FAILED, MSG_DELETE_FAILED))
      }
      return c.json(ok(result))
    } catch {
      return c.json(err(ERROR_CODES.NOTION_SYNC_FAILED, MSG_DELETE_FAILED))
    }
  })

  // 一括同期（POST /projects/:project/sync）。処理完了を待たず jobId を即時返却（REQ-204）。
  router.post("/projects/:project/sync", (c) => {
    const project = c.req.param("project")
    const job = deps.runner.start(project)
    return c.json(ok(job))
  })

  return router
}
