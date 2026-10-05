// 個別同期オーケストレーション syncOne（TASK-0010 / 再同期対応）。
//
// 設計契約: api-endpoints.md（POST /api/tasks/:project/:taskId/sync）/ requirements.md
// （REQ-004/006/108/109/111/201/202, EDGE-202, NFR-002）/ dataflow.md（SyncOrchestrator）。
//
// フロー:
//   A. 未同期/失敗（not_synced/sync_failed）: 楽観ロック → Notion DB 解決 → createPage（新規）→ markSynced。
//   B. 同期済み（synced）で「ソースが同期時から変化」している場合: 再同期ロック →
//      既存 notion_page_id を updatePage（重複ページを作らない）→ markSynced でスナップショット更新。
//      変化が無ければ何もしない（既に最新）。
//   いずれの成功時も markSynced に「同期したソース状態」のスナップショットを渡し、
//   update_badge をクリアする（差分追跡の基準点。更新ありは mergeTasks が差分から再算出する）。
//
// セキュリティ（P0/NFR-006）:
// - last_error には NotionApiError.message（識別用短文）のみを保存し、トークン・本文を含めない。
// - ロガーは project/taskId/success のみ記録。シークレット/PII を出さない。

import type {
  DeletedSnapshot,
  SourceTask,
  SyncResult,
} from "../../shared/index.js"
import type { AppLogger } from "../logger/index.js"
import { logger as sharedLogger } from "../logger/index.js"
import type { MetaStore } from "./meta-store.js"
import type { NotionClient } from "./notion-client.js"

/** 対象プロジェクトの SourceTask を読むための最小インターフェース（TaskReader 互換）。 */
export interface SourceTaskLookup {
  readProjectTasks(project: string): SourceTask[]
}

/** syncOne の対象タスク指定。 */
export interface SyncTarget {
  project: string
  taskId: string
}

/** syncOne の依存（注入）。 */
export interface SyncOneDeps {
  store: MetaStore
  notion: NotionClient
  lookup: SourceTaskLookup
  /** ロガー（既定は共有 logger）。テストで差し替え可能。 */
  logger?: AppLogger
}

/** ロック取得不能・対象不在時のフォールバック理由文（機密でない短文）。 */
const ERR_TASK_NOT_FOUND = "ソースタスクが見つかりません"

/** ソースタスクから同期スナップショット（差分基準）を作る。 */
function snapshotOf(task: SourceTask): DeletedSnapshot {
  return {
    title: task.title,
    content: task.content,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

/** スナップショットとソースに差分（title/content/status）があるか。 */
function hasChanged(source: SourceTask, snap: DeletedSnapshot | null): boolean {
  if (!snap) return true
  return (
    source.title !== snap.title ||
    source.content !== snap.content ||
    source.status !== snap.status
  )
}

/**
 * タスク 1 件を Notion に登録／更新する。
 *
 * - 未同期/失敗 → 新規ページ作成。
 * - 同期済みで変化あり → 既存ページを更新（重複を作らない）。
 * - 同期済みで変化なし、または syncing/pending_deletion/メタ未登録 → NotionClient を
 *   呼ばずに現状ステータスを返す。
 */
export async function syncOne(
  target: SyncTarget,
  deps: SyncOneDeps,
): Promise<SyncResult> {
  const { store, notion, lookup } = deps
  const log = deps.logger ?? sharedLogger
  const { project, taskId } = target

  const meta = store.getTaskMeta(project, taskId)

  // ===== B. 同期済み: 変化があれば既存ページを更新（再同期） =====
  if (meta?.notionSyncStatus === "synced") {
    const sourceTask = lookup
      .readProjectTasks(project)
      .find((t) => t.taskId === taskId)
    // ソース消失は削除検知（mergeTasks）に委ねる。ここでは何もしない。
    if (!sourceTask) {
      return { project, taskId, status: "synced" }
    }
    // 変化が無ければ既に最新。NotionClient を呼ばない。
    if (!hasChanged(sourceTask, meta.deletedSnapshot)) {
      return {
        project,
        taskId,
        status: "synced",
        notionPageId: meta.notionPageId ?? undefined,
      }
    }
    // 再同期ロック（synced → syncing）。取得失敗は他処理が先行。
    if (!store.tryAcquireResyncLock(project, taskId)) {
      const current = store.getTaskMeta(project, taskId)
      return { project, taskId, status: current?.notionSyncStatus ?? "synced" }
    }
    try {
      if (meta.notionPageId) {
        await notion.updatePage(meta.notionPageId, sourceTask)
        store.markSynced(project, taskId, meta.notionPageId, snapshotOf(sourceTask))
        log.logNotionSync(project, taskId, true)
        return { project, taskId, status: "synced", notionPageId: meta.notionPageId }
      }
      // 同期済みなのに page_id 欠落（異常系）→ 新規作成にフォールバック。
      const databaseId = await resolveDatabaseId(store, notion, project)
      const newPageId = await notion.createPage(databaseId, sourceTask)
      store.markSynced(project, taskId, newPageId, snapshotOf(sourceTask))
      log.logNotionSync(project, taskId, true)
      return { project, taskId, status: "synced", notionPageId: newPageId }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Notion 連携に失敗しました"
      store.markSyncFailed(project, taskId, message)
      log.logNotionSync(project, taskId, false)
      return { project, taskId, status: "sync_failed", error: message }
    }
  }

  // ===== A. 未同期/失敗: 新規登録 =====
  // 楽観ロック取得（not_synced/sync_failed → syncing）。
  // 取得失敗（changes===0）は他処理が先行 or 既に synced/syncing/メタ未登録のためスキップ。
  if (!store.tryAcquireSyncLock(project, taskId)) {
    const current = store.getTaskMeta(project, taskId)
    return {
      project,
      taskId,
      status: current?.notionSyncStatus ?? "not_synced",
    }
  }

  // ソースタスクを取得。消失していれば失敗扱い（再走査で再判定可能）。
  const sourceTask = lookup
    .readProjectTasks(project)
    .find((t) => t.taskId === taskId)
  if (!sourceTask) {
    store.markSyncFailed(project, taskId, ERR_TASK_NOT_FOUND)
    log.logNotionSync(project, taskId, false)
    return { project, taskId, status: "sync_failed", error: ERR_TASK_NOT_FOUND }
  }

  try {
    // Notion DB を解決（未作成なら作成して対応を保存 REQ-111）。
    const databaseId = await resolveDatabaseId(store, notion, project)
    // ページ登録（リトライ・429 追従は NotionClient が内蔵。失敗時は throw）。
    const pageId = await notion.createPage(databaseId, sourceTask)
    store.markSynced(project, taskId, pageId, snapshotOf(sourceTask))
    log.logNotionSync(project, taskId, true)
    return { project, taskId, status: "synced", notionPageId: pageId }
  } catch (e) {
    // NotionApiError.message は識別用短文（トークン・本文を含まない設計）。
    const message = e instanceof Error ? e.message : "Notion 連携に失敗しました"
    store.markSyncFailed(project, taskId, message)
    log.logNotionSync(project, taskId, false)
    return { project, taskId, status: "sync_failed", error: message }
  }
}

/**
 * プロジェクトの Notion DB ID を解決する。未作成なら作成し対応を保存する（REQ-111）。
 */
async function resolveDatabaseId(
  store: MetaStore,
  notion: NotionClient,
  project: string,
): Promise<string> {
  const existing = store.getNotionProject(project)
  if (existing) return existing.notionDatabaseId
  const databaseId = await notion.createDatabase(project)
  store.upsertNotionProject(project, databaseId)
  return databaseId
}
