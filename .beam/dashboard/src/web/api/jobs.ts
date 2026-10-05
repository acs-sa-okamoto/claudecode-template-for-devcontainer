// 一括登録ジョブの進捗取得 API クライアント。GET /api/jobs/:jobId（REQ-011）。

import type { SyncJob } from "../../shared/index.js"
import { apiFetch } from "./client.js"

/** ジョブ進捗を取得する（進捗バーのポーリング元データ）。 */
export async function getJob(
  jobId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncJob> {
  const path = `/api/jobs/${encodeURIComponent(jobId)}`
  return apiFetch<SyncJob>(path, undefined, fetchImpl)
}
