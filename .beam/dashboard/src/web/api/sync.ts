// 同期操作 API クライアント（個別登録 / 削除同期 / 一括登録）。
//
// すべて同一オリジンの /api/* を呼ぶ。フロントから DB へ直接接続せず必ず API 経由。
// project はパスへ埋め込むため encodeURIComponent でエンコードし、区切り混入を防ぐ。

import type { SyncJob, SyncResult } from "../../shared/index.js"
import { apiFetch } from "./client.js"

/** POST のための共通 init。 */
const POST: RequestInit = { method: "POST" }

/** タスク 1 件を Notion に個別登録する（REQ-004）。 */
export async function syncOne(
  project: string,
  taskId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncResult> {
  const path = `/api/tasks/${encodeURIComponent(project)}/${encodeURIComponent(taskId)}/sync`
  return apiFetch<SyncResult>(path, POST, fetchImpl)
}

/** pending_deletion のタスクの削除を Notion に反映する（REQ-106）。 */
export async function syncDelete(
  project: string,
  taskId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncResult> {
  const path = `/api/tasks/${encodeURIComponent(project)}/${encodeURIComponent(taskId)}/delete-sync`
  return apiFetch<SyncResult>(path, POST, fetchImpl)
}

/** プロジェクトの一括登録ジョブを開始し、即時に SyncJob を返す（REQ-005）。 */
export async function startBulkSync(
  project: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncJob> {
  const path = `/api/projects/${encodeURIComponent(project)}/sync`
  return apiFetch<SyncJob>(path, POST, fetchImpl)
}
