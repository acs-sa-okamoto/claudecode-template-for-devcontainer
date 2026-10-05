// TASK-0015: GET /api/tasks ルート（タスク一覧 API）
//
// 役割: mergeTasks(reader, store)（TASK-0008）のマージ結果（ProjectGroup[]）を
// GetTasksResponse 形式（{ projects }）で返す。最大 1000 件を一括返却し
// ページネーションは行わない（NFR-001）。
//
// 依存注入: listTasks（= () => mergeTasks(reader, store)）を受け取り、
// 実 TaskReader / MetaStore を直接 import しない。これにより実 DB 非依存テストが可能。
//
// セキュリティ（P0 / NFR-303）:
// - DB 接続/読取の失敗はクラッシュさせず DB_CONNECTION_FAILED を返す（フェイルクローズ）。
// - エラーメッセージは日本語の固定文言。内部構成情報・例外詳細は出さない（情報漏えい防止）。
// - SQL は本層で書かず、注入されたサービス（パラメータ化済み）を経由する。

import { Hono } from "hono"
import {
  ERROR_CODES,
  err,
  ok,
  type GetTasksResponse,
  type ProjectGroup,
} from "../../shared/index.js"

/** タスク一覧ルートの依存（テストでフェイク注入可能）。 */
export interface TasksRouterDeps {
  /**
   * マージ済みのタスク一覧を返す。
   * 本番では `() => mergeTasks(reader, store)` を渡す。
   * DB 接続/読取エラー時は例外（SourceDbConnectionError 等）を throw してよい。
   */
  listTasks: () => ProjectGroup[]
}

/** DB エラー時のユーザ向けメッセージ（日本語・内部情報なし NFR-201）。 */
const DB_ERROR_MESSAGE = "タスクの読み込みに失敗しました（DB に接続できません）"

/**
 * GET /api/tasks を提供するサブルータを生成する。
 * createApp 側で `app.route("/api/tasks", createTasksRouter(deps))` でマウントする。
 */
export function createTasksRouter(deps: TasksRouterDeps): Hono {
  const router = new Hono()

  router.get("/", (c) => {
    try {
      // マージ・並び替え・pending_deletion 保持はサービス層（mergeTasks）が担保。
      const projects = deps.listTasks()
      const body: GetTasksResponse = { projects }
      return c.json(ok(body))
    } catch {
      // どの例外でも安全側に倒して DB_CONNECTION_FAILED を返す（プロセス継続）。
      // 例外詳細はレスポンスに含めない（情報漏えい防止 / P0）。
      return c.json(err(ERROR_CODES.DB_CONNECTION_FAILED, DB_ERROR_MESSAGE))
    }
  })

  return router
}
