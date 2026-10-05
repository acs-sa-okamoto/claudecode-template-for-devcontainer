// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import type { SyncJob } from "../../shared/index.js"
import { getJob } from "./jobs.js"

describe("api/jobs", () => {
  it("TC-04: getJob が GET /api/jobs/:jobId を呼び SyncJob を返す", () => {
    // 【テスト目的】ジョブ進捗取得 API クライアント（REQ-011）
    // 【テスト内容】running ジョブを返す fetch を注入し URL を検証
    // 【期待される動作】GET /api/jobs/:jobId・SyncJob 返却
    const job: SyncJob = {
      jobId: "job_1",
      project: "p",
      total: 42,
      done: 30,
      failed: 1,
      status: "running",
      etaSeconds: 72,
      startedAt: "t",
    }
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, data: job }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch
    return getJob("job_1", f).then((j) => {
      expect(j).toEqual(job)
      const url = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
      expect(url).toBe("/api/jobs/job_1")
    })
  })
})
