// 削除同期 syncDelete（TASK-0012）。
//
// 設計契約: api-endpoints.md（POST /api/tasks/:project/:taskId/delete-sync）/ requirements.md
// （REQ-106, NFR-301）/ dataflow.md。
//
// フロー:
//   1. getTaskMeta で対象メタを取得。pending_deletion でなければ削除対象外としてスキップ。
//   2. notion_page_id があれば NotionClient.deletePage（アーカイブ。リトライ・429 は内蔵）。
//      page_id が null なら Notion 側に対応ページが無いとみなし削除をスキップ（取りこぼし防止）。
//   3. 成功 → MetaStore.deleteTaskMeta（メタ消去 = 一覧から消える REQ-106）。
//      失敗 → MetaStore.markSyncFailed（メタは残し再試行可能性を保つ NFR-301）。
//
// セキュリティ（P0/NFR-006）:
// - last_error は NotionApiError.message（識別用短文）のみ。トークン・本文を含めない。
// - ロガーは project/taskId/success のみ記録。シークレット/PII を出さない。
//
// 設計判断: SyncResult.status は NotionSyncStatus（"deleted" を持たない）。本操作は削除完了を
// 表す必要があるため、共有契約を改変せず本ファイル専用の DeleteSyncResult 型を新設する
// （api-endpoints.md の成功レスポンス status="deleted" に整合）。

import type { AppLogger } from "../logger/index.js"
import { logger as sharedLogger } from "../logger/index.js"
import type { MetaStore } from "./meta-store.js"
import type { NotionClient } from "./notion-client.js"
import type { NotionSyncStatus } from "../../shared/index.js"

/** 削除同期の対象タスク指定。 */
export interface DeleteSyncTarget {
  project: string
  taskId: string
}

/** syncDelete の依存（注入）。 */
export interface SyncDeleteDeps {
  store: MetaStore
  notion: NotionClient
  /** ロガー（既定は共有 logger）。 */
  logger?: AppLogger
}

/**
 * 削除同期の結果。
 * - "deleted": Notion ページ削除に成功しメタを消去した（一覧から消える）。
 * - それ以外（NotionSyncStatus）: 削除対象外でスキップ、または失敗（sync_failed）。
 */
export interface DeleteSyncResult {
  project: string
  taskId: string
  status: "deleted" | NotionSyncStatus
  error?: string
}

/**
 * pending_deletion のタスクを Notion から削除し、成功後にメタを消去する。
 *
 * pending_deletion でないタスク・メタ未登録のタスクは削除対象外としてスキップする。
 */
export async function syncDelete(
  target: DeleteSyncTarget,
  deps: SyncDeleteDeps,
): Promise<DeleteSyncResult> {
  const { store, notion } = deps
  const log = deps.logger ?? sharedLogger
  const { project, taskId } = target

  const meta = store.getTaskMeta(project, taskId)
  // 1. 削除対象外（未登録 or pending_deletion 以外）はスキップ。
  if (!meta) {
    return { project, taskId, status: "not_synced" }
  }
  if (meta.notionSyncStatus !== "pending_deletion") {
    return { project, taskId, status: meta.notionSyncStatus }
  }

  try {
    // 2. Notion ページ削除（page_id が無ければ削除すべきページが無いためスキップ）。
    if (meta.notionPageId) {
      await notion.deletePage(meta.notionPageId)
    }
    // 3. 成功 → メタ消去（一覧から除外）。
    store.deleteTaskMeta(project, taskId)
    log.logNotionSync(project, taskId, true)
    return { project, taskId, status: "deleted" }
  } catch (e) {
    // 失敗 → メタは消さず sync_failed（再試行可能性を保つ NFR-301）。
    const message = e instanceof Error ? e.message : "Notion ページ削除に失敗しました"
    store.markSyncFailed(project, taskId, message)
    log.logNotionSync(project, taskId, false)
    return { project, taskId, status: "sync_failed", error: message }
  }
}
