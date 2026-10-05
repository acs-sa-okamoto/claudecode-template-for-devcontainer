// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import type { GetTasksResponse, ApiResponse } from "../shared/index.js"
import { ApiError } from "./api/client.js"
import { loadAndRenderTasks, renderLayout } from "./app.js"

// fetch スタブを生成するヘルパ（実サーバ非依存）。
function stubFetch(body: ApiResponse<GetTasksResponse>): typeof fetch {
  return vi.fn().mockResolvedValue({
    json: async () => body,
  }) as unknown as typeof fetch
}

describe("renderLayout", () => {
  it("ヘッダと一覧コンテナを構築する", () => {
    const root = document.createElement("div")
    const { header, taskList } = renderLayout(root)
    expect(header.id).toBe("app-header")
    expect(taskList.id).toBe("task-list")
    expect(root.querySelector("h1")?.textContent).toBe("task-bridge")
  })
})

describe("loadAndRenderTasks", () => {
  it("TC-E2E-01: fetch 応答をグルーピング描画し昇順で並べる", async () => {
    // 【テスト目的】一覧ロード→描画の往復（REQ-002/003）
    // 【テスト内容】2 プロジェクト・順不同タスクの応答を描画
    // 【期待される動作】各 section が描画され行が昇順
    const body: ApiResponse<GetTasksResponse> = {
      success: true,
      data: {
        projects: [
          {
            project: "alpha",
            notionLinked: false,
            tasks: [
              {
                taskId: "2",
                project: "alpha",
                title: "b",
                content: "",
                status: "ready",
                createdAt: "x",
                updatedAt: "x",
                notionSyncStatus: "not_synced",
                isDeleted: false,
                updateBadge: false,
              },
              {
                taskId: "1",
                project: "alpha",
                title: "a",
                content: "",
                status: "ready",
                createdAt: "x",
                updatedAt: "x",
                notionSyncStatus: "not_synced",
                isDeleted: false,
                updateBadge: false,
              },
            ],
          },
        ],
      },
    }
    const container = document.createElement("div")
    const result = await loadAndRenderTasks(container, {
      fetchImpl: stubFetch(body),
    })
    expect(result?.groups.length).toBe(1)
    const ids = Array.from(
      container.querySelectorAll<HTMLElement>(".task-row"),
    ).map((r) => r.dataset.taskId)
    expect(ids).toEqual(["1", "2"])
    // ローディングは完了後に消える
    expect(container.querySelector("#loading-indicator")).toBeNull()
  })

  it("TC-E01: success:false 応答で onError に委譲し再 throw しない", async () => {
    // 【テスト目的】エラー応答を停止せず onError へ委譲（NFR-303）
    const body: ApiResponse<GetTasksResponse> = {
      success: false,
      error: { code: "DB_CONNECTION_FAILED", message: "DB error" },
    }
    const container = document.createElement("div")
    const onError = vi.fn()
    const result = await loadAndRenderTasks(container, {
      fetchImpl: stubFetch(body),
      onError,
    })
    expect(result).toBeNull()
    expect(onError).toHaveBeenCalledTimes(1)
    const reported = onError.mock.calls[0]?.[0] as ApiError
    expect(reported).toBeInstanceOf(ApiError)
    expect(reported.code).toBe("DB_CONNECTION_FAILED")
  })
})
