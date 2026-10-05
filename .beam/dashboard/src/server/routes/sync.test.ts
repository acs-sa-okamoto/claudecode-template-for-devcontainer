// TASK-0016: 同期系ルート（sync.ts）の単体・統合テスト。
//
// 個別 sync / 削除 sync / 一括 sync を提供する createSyncRouter を検証する。
// syncOne / syncDelete / runner は注入で受けるため、実 Notion / 実ソース DB に依存しない。
// 統合（TC-E2E-01）のみ :memory: MetaStore + 実 SyncBatchRunner を結線して確認する。

import Database from "better-sqlite3"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"
import { Hono } from "hono"
import type {
  SyncJob,
  SyncResult,
} from "../../shared/index.js"
import { MetaStore } from "../services/meta-store.js"
import { SyncBatchRunner } from "../services/sync-batch.js"
import type { DeleteSyncResult } from "../services/sync-delete.js"
import { createSyncRouter, type SyncRouterDeps } from "./sync.js"
import { createJobsRouter } from "./jobs.js"

const SCHEMA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/schema.sql",
)

/** sync ルータをマウントした最小アプリ。 */
function makeApp(deps: SyncRouterDeps): Hono {
  const app = new Hono()
  app.route("/api", createSyncRouter(deps))
  return app
}

const okSync = (over: Partial<SyncResult> = {}): SyncResult => ({
  project: "projA",
  taskId: "1",
  status: "synced",
  notionPageId: "p1",
  ...over,
})

const okDelete = (over: Partial<DeleteSyncResult> = {}): DeleteSyncResult => ({
  project: "projA",
  taskId: "7",
  status: "deleted",
  ...over,
})

const sampleJob = (over: Partial<SyncJob> = {}): SyncJob => ({
  jobId: "job_x",
  project: "projA",
  total: 3,
  done: 0,
  failed: 0,
  status: "running",
  etaSeconds: null,
  startedAt: "2026-06-03T10:00:00Z",
  ...over,
})

/** runner（start/getJob）の最小フェイク。 */
function fakeRunner(over: Partial<{ start: () => SyncJob; getJob: () => SyncJob | null }> = {}) {
  return {
    start: over.start ?? (() => sampleJob()),
    getJob: over.getJob ?? (() => sampleJob()),
  }
}

describe("同期系ルート（sync.ts）", () => {
  it("TC-01: 個別 sync 成功で SyncResult を返す", async () => {
    // 【テスト目的】syncOne 成功時に 200・synced・notionPageId を返すこと。
    // 【テスト内容】syncOne が synced を返すフェイクを注入し POST する。
    // 【期待される動作】success:true・data.status==="synced"・notionPageId==="p1"。
    const syncOne = vi.fn(async () => okSync())
    const app = makeApp({
      syncOne,
      syncDelete: async () => okDelete(),
      runner: fakeRunner(),
    })
    const res = await app.request("/api/tasks/projA/1/sync", { method: "POST" })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.status).toBe("synced")
    expect(body.data.notionPageId).toBe("p1")
    expect(syncOne).toHaveBeenCalledWith({ project: "projA", taskId: "1" })
  })

  it("TC-02: 一括 sync が即時 jobId を返す", async () => {
    // 【テスト目的】runner.start の SyncJob を即時返却すること（REQ-204）。
    // 【テスト内容】start が SyncJob を返す runner を注入し POST する。
    // 【期待される動作】success:true・data.jobId 存在・status==="running"。
    const app = makeApp({
      syncOne: async () => okSync(),
      syncDelete: async () => okDelete(),
      runner: fakeRunner({ start: () => sampleJob({ jobId: "job_started" }) }),
    })
    const res = await app.request("/api/projects/projA/sync", { method: "POST" })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.jobId).toBe("job_started")
    expect(body.data.status).toBe("running")
  })

  it("TC-04: delete-sync 成功で status='deleted' を返す", async () => {
    // 【テスト目的】syncDelete 成功で 200・deleted を返すこと（REQ-106）。
    // 【テスト内容】syncDelete が deleted を返すフェイクを注入。
    // 【期待される動作】success:true・data.status==="deleted"。
    const syncDelete = vi.fn(async () => okDelete())
    const app = makeApp({
      syncOne: async () => okSync(),
      syncDelete,
      runner: fakeRunner(),
    })
    const res = await app.request("/api/tasks/projA/7/delete-sync", { method: "POST" })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.status).toBe("deleted")
    expect(syncDelete).toHaveBeenCalledWith({ project: "projA", taskId: "7" })
  })

  it("TC-05: sync スキップ（syncing）は現状 status を ok で返す", async () => {
    // 【テスト目的】二重登録防止スキップ（EDGE-202）はエラーにせず現状 status を返すこと。
    // 【テスト内容】syncOne が syncing を返す。
    // 【期待される動作】success:true・data.status==="syncing"。
    const app = makeApp({
      syncOne: async () => okSync({ status: "syncing", notionPageId: undefined }),
      syncDelete: async () => okDelete(),
      runner: fakeRunner(),
    })
    const res = await app.request("/api/tasks/projA/1/sync", { method: "POST" })
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.status).toBe("syncing")
  })

  it("TC-E01: 個別 sync 失敗（sync_failed）で NOTION_SYNC_FAILED", async () => {
    // 【テスト目的】sync_failed を NOTION_SYNC_FAILED に整形すること（REQ-109）。
    // 【テスト内容】syncOne が sync_failed を返す。
    // 【期待される動作】success:false・error.code==="NOTION_SYNC_FAILED"。
    const app = makeApp({
      syncOne: async () => okSync({ status: "sync_failed", error: "x", notionPageId: undefined }),
      syncDelete: async () => okDelete(),
      runner: fakeRunner(),
    })
    const res = await app.request("/api/tasks/projA/1/sync", { method: "POST" })
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("NOTION_SYNC_FAILED")
  })

  it("TC-E02: delete-sync 失敗（sync_failed）で NOTION_SYNC_FAILED", async () => {
    // 【テスト目的】削除失敗を NOTION_SYNC_FAILED に整形すること（REQ-106）。
    // 【テスト内容】syncDelete が sync_failed を返す。
    // 【期待される動作】success:false・error.code==="NOTION_SYNC_FAILED"。
    const app = makeApp({
      syncOne: async () => okSync(),
      syncDelete: async () => okDelete({ status: "sync_failed", error: "x" }),
      runner: fakeRunner(),
    })
    const res = await app.request("/api/tasks/projA/7/delete-sync", { method: "POST" })
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("NOTION_SYNC_FAILED")
  })

  it("TC-E04: 不正文字を含む taskId で VALIDATION_ERROR(400)・syncOne 不呼出", async () => {
    // 【テスト目的】許可文字種（英数字・ハイフン・アンダースコア）以外を含む taskId を
    // 入力検証で拒否すること（P0 入力検証・parseTaskId）。
    // 【テスト内容】taskId="a.b"（ドット混入）で POST。
    // 【期待される動作】400・error.code==="VALIDATION_ERROR"・syncOne 未呼出。
    const syncOne = vi.fn(async () => okSync())
    const app = makeApp({
      syncOne,
      syncDelete: async () => okDelete(),
      runner: fakeRunner(),
    })
    const res = await app.request("/api/tasks/projA/a.b/sync", { method: "POST" })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe("VALIDATION_ERROR")
    expect(syncOne).not.toHaveBeenCalled()
  })

  it("TC-E05: syncOne が例外を投げてもクラッシュせず NOTION_SYNC_FAILED", async () => {
    // 【テスト目的】未捕捉例外でもフェイルクローズで安全側に倒すこと。
    // 【テスト内容】syncOne が throw。
    // 【期待される動作】success:false・error.code==="NOTION_SYNC_FAILED"。
    const app = makeApp({
      syncOne: async () => {
        throw new Error("boom")
      },
      syncDelete: async () => okDelete(),
      runner: fakeRunner(),
    })
    const res = await app.request("/api/tasks/projA/1/sync", { method: "POST" })
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("NOTION_SYNC_FAILED")
  })

  it("TC-B01: taskId=\"0\" は有効", async () => {
    // 【テスト目的】境界値 "0" を有効な taskId 文字列として扱うこと。
    // 【テスト内容】taskId="0" で POST。
    // 【期待される動作】syncOne が taskId:"0" で呼ばれる。
    const syncOne = vi.fn(async () => okSync({ taskId: "0" }))
    const app = makeApp({
      syncOne,
      syncDelete: async () => okDelete(),
      runner: fakeRunner(),
    })
    await app.request("/api/tasks/projA/0/sync", { method: "POST" })
    expect(syncOne).toHaveBeenCalledWith({ project: "projA", taskId: "0" })
  })
})

describe("ジョブ取得ルート（jobs.ts）", () => {
  /** jobs ルータをマウントした最小アプリ。 */
  function makeJobsApp(getJob: (jobId: string) => SyncJob | null): Hono {
    const app = new Hono()
    app.route("/api/jobs", createJobsRouter({ getJob }))
    return app
  }

  it("TC-03: jobs 取得で進捗を返す", async () => {
    // 【テスト目的】getJob の SyncJob を返すこと（REQ-011）。
    // 【テスト内容】getJob が SyncJob を返す。
    // 【期待される動作】success:true・data.jobId==="job_x"。
    const app = makeJobsApp(() => sampleJob())
    const res = await app.request("/api/jobs/job_x")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.jobId).toBe("job_x")
  })

  it("TC-E03: 存在しない jobId で NOT_FOUND", async () => {
    // 【テスト目的】未知 jobId で NOT_FOUND を返すこと（api-endpoints.md）。
    // 【テスト内容】getJob が null。
    // 【期待される動作】success:false・error.code==="NOT_FOUND"。
    const app = makeJobsApp(() => null)
    const res = await app.request("/api/jobs/unknown")
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("NOT_FOUND")
  })
})

describe("統合: 一括 sync → jobId で進捗取得", () => {
  it("TC-E2E-01: 実 MetaStore + 実 SyncBatchRunner で jobId 経由の進捗が取れる", async () => {
    // 【テスト目的】runner.start の jobId で getJob 進捗が取得できること（REQ-204+REQ-011）。
    // 【テスト内容】:memory: MetaStore に not_synced を 2 件仕込み、sync/jobs ルータを結線。
    // 【期待される動作】POST で得た jobId を GET /api/jobs/:jobId で取得し total===2。
    const db = new Database(":memory:")
    db.pragma("foreign_keys = ON")
    db.exec(readFileSync(SCHEMA_PATH, "utf8"))
    const store = new MetaStore(db)
    const now = "2026-06-03T10:00:00Z"
    store.upsertTaskMeta({
      project: "projA",
      taskId: "1",
      notionSyncStatus: "not_synced",
      notionPageId: null,
      updateBadge: false,
      isDeleted: false,
      deletedSnapshot: null,
      lastError: null,
      metaUpdatedAt: now,
    })
    store.upsertTaskMeta({
      project: "projA",
      taskId: "2",
      notionSyncStatus: "not_synced",
      notionPageId: null,
      updateBadge: false,
      isDeleted: false,
      deletedSnapshot: null,
      lastError: null,
      metaUpdatedAt: now,
    })

    // syncOne / syncDelete は即時成功するフェイク（実 Notion 非依存）。sleep も無効化。
    const runner = new SyncBatchRunner({
      store,
      syncOne: async (t) => ({ project: t.project, taskId: t.taskId, status: "synced", notionPageId: "p" }),
      syncDelete: async (t) => ({ project: t.project, taskId: t.taskId, status: "deleted" }),
      sleep: async () => {},
    })

    const app = new Hono()
    app.route("/api", createSyncRouter({
      syncOne: async () => okSync(),
      syncDelete: async () => okDelete(),
      runner,
    }))
    app.route("/api/jobs", createJobsRouter({ getJob: (id) => runner.getJob(id) }))

    const startRes = await app.request("/api/projects/projA/sync", { method: "POST" })
    const startBody = await startRes.json()
    const jobId: string = startBody.data.jobId
    expect(startBody.data.total).toBe(2)

    const jobRes = await app.request(`/api/jobs/${jobId}`)
    const jobBody = await jobRes.json()
    expect(jobBody.success).toBe(true)
    expect(jobBody.data.jobId).toBe(jobId)
    expect(jobBody.data.total).toBe(2)

    await runner.whenIdle(jobId)
    db.close()
  })
})
