// タスク一覧 API クライアント。GET /api/tasks を取得する。

import type { GetTasksResponse, ProjectGroup } from "../../shared/index.js"
import { apiFetch } from "./client.js"

/**
 * GET /api/tasks を取得し、ProjectGroup[] を返す。
 * エラー時は ApiError を throw（呼び出し側でエラー画面に委譲）。
 */
export async function fetchTasks(
  fetchImpl: typeof fetch = fetch,
): Promise<ProjectGroup[]> {
  const data = await apiFetch<GetTasksResponse>(
    "/api/tasks",
    undefined,
    fetchImpl,
  )
  return data.projects
}
