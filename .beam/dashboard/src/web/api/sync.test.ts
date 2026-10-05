// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import type { SyncJob, SyncResult } from "../../shared/index.js"
import { ApiError } from "./client.js"
import { startBulkSync, syncDelete, syncOne } from "./sync.js"

// ApiResponse<T> 成功応答を返す fetch フェイクを作る。
function okFetch(data: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch
}

describe("api/sync", () => {
  it("TC-01: syncOne が個別登録エンドポイントを呼び SyncResult を返す", () => {
    // 【テスト目的】個別登録 API クライアントの URL/メソッド/戻り値（REQ-004）
    // 【テスト内容】synced を返す fetch を注入し、呼び出し URL を検証
    // 【期待される動作】POST /api/tasks/:project/:taskId/sync・SyncResult 返却
    const result: SyncResult = {
      project: "p",
      taskId: "1",
      status: "synced",
      notionPageId: "x",
    }
    const f = okFetch(result)
    return syncOne("p", "1", f).then((r) => {
      expect(r).toEqual(result)
      const call = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(call?.[0]).toBe("/api/tasks/p/1/sync")
      expect(call?.[1]?.method).toBe("POST")
    })
  })

  it("TC-02: syncDelete が削除同期エンドポイントを呼ぶ", () => {
    // 【テスト目的】削除同期 API クライアント（REQ-106）
    const f = okFetch({ project: "p", taskId: "7", status: "deleted" })
    return syncDelete("p", "7", f).then((r) => {
      expect(r.status).toBe("deleted")
      const call = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(call?.[0]).toBe("/api/tasks/p/7/delete-sync")
      expect(call?.[1]?.method).toBe("POST")
    })
  })

  it("TC-03: startBulkSync が一括登録エンドポイントを呼び SyncJob を返す", () => {
    // 【テスト目的】一括登録ジョブ開始 API クライアント（REQ-005）
    const job: SyncJob = {
      jobId: "job_1",
      project: "p",
      total: 3,
      done: 0,
      failed: 0,
      status: "running",
      etaSeconds: null,
      startedAt: "t",
    }
    const f = okFetch(job)
    return startBulkSync("p", f).then((j) => {
      expect(j).toEqual(job)
      const call = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(call?.[0]).toBe("/api/projects/p/sync")
      expect(call?.[1]?.method).toBe("POST")
    })
  })

  it("TC-E01: API 失敗時は ApiError を throw する", () => {
    // 【テスト目的】フェイルクローズ（呼び出し側がエラー表示へ委譲）
    const f = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: false,
          error: { code: "NOTION_SYNC_FAILED", message: "失敗" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch
    return expect(syncOne("p", "1", f)).rejects.toBeInstanceOf(ApiError)
  })

  it("project 名は URL エンコードされる（パス区切り混入防止）", () => {
    // 【テスト目的】project にスラッシュ等が含まれてもパスを破壊しない（堅牢化）
    const f = okFetch({ project: "a/b", taskId: "1", status: "synced" })
    return syncOne("a/b", "1", f).then(() => {
      const url = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
      expect(url).toBe("/api/tasks/a%2Fb/1/sync")
    })
  })
})
