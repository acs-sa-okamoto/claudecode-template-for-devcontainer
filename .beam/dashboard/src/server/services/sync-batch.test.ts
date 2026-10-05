// TASK-0011: 一括同期 SyncBatchRunner の単体・統合テスト。
//
// 実 MetaStore（:memory: + schema.sql）と、フェイク syncOne/syncDelete/sleep/now/genJobId で
// 検証する。実時間・実 Notion API には依存しない。バックグラウンド処理は whenIdle で待つ。

import Database from "better-sqlite3"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NotionSyncStatus } from "../../shared/index.js"
import { MetaStore } from "./meta-store.js"
import { SyncBatchRunner } from "./sync-batch.js"

const SCHEMA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/schema.sql",
)
const PROJECT = "projA"

function makeStore(): MetaStore {
  const db = new Database(":memory:")
  db.pragma("foreign_keys = ON")
  db.exec(readFileSync(SCHEMA_PATH, "utf8"))
  return new MetaStore(db)
}

/** project に taskId/status のメタを並べる。 */
function seed(store: MetaStore, rows: Array<[number, NotionSyncStatus]>): void {
  for (const [taskId, status] of rows) {
    store.upsertTaskMeta({
      project: PROJECT,
      taskId,
      notionSyncStatus: status,
      notionPageId: status === "pending_deletion" ? `page-${taskId}` : null,
      updateBadge: false,
      isDeleted: status === "pending_deletion",
      deletedSnapshot: null,
      lastError: null,
      metaUpdatedAt: "2026-01-01T00:00:00Z",
    })
  }
}

/** 固定の jobId 生成・固定 now を持つ依存セットを作る。 */
function baseDeps(store: MetaStore, over: Record<string, unknown> = {}) {
  return {
    store,
    syncOne: vi.fn(async (t: { project: string; taskId: number }) => ({
      project: t.project,
      taskId: t.taskId,
      status: "synced" as const,
    })),
    syncDelete: vi.fn(async (t: { project: string; taskId: number }) => ({
      project: t.project,
      taskId: t.taskId,
      status: "deleted" as const,
    })),
    sleep: vi.fn(async () => {}),
    now: () => 1_000_000,
    genJobId: () => "job_test_1",
    logger: { info: vi.fn(), error: vi.fn() } as never,
    ...over,
  }
}

describe("SyncBatchRunner", () => {
  let store: MetaStore
  beforeEach(() => {
    store = makeStore()
  })

  it("TC-01: start で jobId/status='running'/total を即時返却（完了を待たない）", () => {
    // 【テスト目的】ジョブ即時返却（REQ-204）。
    seed(store, [
      [1, "not_synced"],
      [2, "not_synced"],
    ])
    const deps = baseDeps(store)
    const runner = new SyncBatchRunner(deps)

    const job = runner.start(PROJECT)

    expect(job.jobId).toBe("job_test_1")
    expect(job.status).toBe("running")
    expect(job.total).toBe(2)
    expect(job.done).toBe(0)
  })

  it("change 3: sync_failed も一括同期の対象に含める（再試行・REQ-203）", () => {
    // 【テスト目的】失敗タスクを一括同期で再試行できること（REQ-203）。
    // 【テスト内容】not_synced 1 件 + sync_failed 1 件を仕込み total を確認。
    // 【期待される動作】両方が同期対象となり total=2。
    seed(store, [
      [1, "not_synced"],
      [2, "sync_failed"],
    ])
    const deps = baseDeps(store)
    const runner = new SyncBatchRunner(deps)

    const job = runner.start(PROJECT)

    expect(job.total).toBe(2)
  })

  it("TC-02: バックグラウンドで全件 syncOne 処理し completed になる", async () => {
    // 【テスト目的】逐次同期で全件完了（REQ-005）。
    seed(store, [
      [1, "not_synced"],
      [2, "not_synced"],
      [3, "not_synced"],
    ])
    const deps = baseDeps(store)
    const runner = new SyncBatchRunner(deps)

    const job = runner.start(PROJECT)
    await runner.whenIdle(job.jobId)

    expect(deps.syncOne).toHaveBeenCalledTimes(3)
    const final = store.getSyncJob(job.jobId)
    expect(final?.done).toBe(3)
    expect(final?.status).toBe("completed")
  })

  it("TC-03: 進捗 done/failed と etaSeconds が更新される", async () => {
    // 【テスト目的】進捗更新と eta 算出（REQ-110/AC-10）。
    seed(store, [
      [1, "not_synced"],
      [2, "not_synced"],
    ])
    const deps = baseDeps(store)
    const runner = new SyncBatchRunner(deps)
    const job = runner.start(PROJECT)
    await runner.whenIdle(job.jobId)

    const view = runner.getJob(job.jobId)
    expect(view?.done).toBe(2)
    expect(view?.failed).toBe(0)
    // 完了後は eta=0（残 0 件）。
    expect(view?.etaSeconds).toBe(0)
  })

  it("TC-04: 一部失敗でも全体継続し completed（成功 done・失敗 failed）", async () => {
    // 【テスト目的】一部失敗の継続（EDGE-005）。
    seed(store, [
      [1, "not_synced"],
      [2, "not_synced"],
      [3, "not_synced"],
    ])
    const deps = baseDeps(store, {
      syncOne: vi.fn(async (t: { project: string; taskId: number }) => ({
        project: t.project,
        taskId: t.taskId,
        // taskId=2 だけ失敗。
        status: (t.taskId === 2 ? "sync_failed" : "synced") as NotionSyncStatus,
      })),
    })
    const runner = new SyncBatchRunner(deps)
    const job = runner.start(PROJECT)
    await runner.whenIdle(job.jobId)

    const final = store.getSyncJob(job.jobId)
    expect(final?.done).toBe(2)
    expect(final?.failed).toBe(1)
    expect(final?.status).toBe("completed")
  })

  it("TC-05: 30 分超過で timeout へ遷移し残処理を打ち切る", async () => {
    // 【テスト目的】30 分タイムアウト（NFR-005）。経過時間をモック。
    seed(store, [
      [1, "not_synced"],
      [2, "not_synced"],
      [3, "not_synced"],
    ])
    let t = 1_000_000
    const THIRTY_MIN = 30 * 60 * 1000
    const deps = baseDeps(store, {
      // 1 件目処理後に時間を 30 分超へ進める。
      sleep: vi.fn(async () => {
        t += THIRTY_MIN + 1
      }),
      now: () => t,
    })
    const runner = new SyncBatchRunner(deps)
    const job = runner.start(PROJECT)
    await runner.whenIdle(job.jobId)

    const final = store.getSyncJob(job.jobId)
    expect(final?.status).toBe("timeout")
    // 1 件目は処理されるが、タイムアウト判定で残りは打ち切られる。
    expect((deps.syncOne as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThan(3)
  })

  it("TC-06: pending_deletion 分は syncDelete で併合処理される", async () => {
    // 【テスト目的】削除併合（api-endpoints.md）。
    seed(store, [
      [1, "not_synced"],
      [2, "pending_deletion"],
    ])
    const deps = baseDeps(store)
    const runner = new SyncBatchRunner(deps)
    const job = runner.start(PROJECT)
    await runner.whenIdle(job.jobId)

    expect(deps.syncOne).toHaveBeenCalledTimes(1)
    expect(deps.syncDelete).toHaveBeenCalledTimes(1)
    expect(deps.syncDelete).toHaveBeenCalledWith({ project: PROJECT, taskId: 2 })
    expect(store.getSyncJob(job.jobId)?.total).toBe(2)
    expect(store.getSyncJob(job.jobId)?.done).toBe(2)
  })

  it("TC-07: 各件処理間にスロットリング sleep が挟まる", async () => {
    // 【テスト目的】429 回避のスロットリング（REQ-110）。
    seed(store, [
      [1, "not_synced"],
      [2, "not_synced"],
    ])
    const deps = baseDeps(store)
    const runner = new SyncBatchRunner(deps)
    const job = runner.start(PROJECT)
    await runner.whenIdle(job.jobId)

    expect((deps.sleep as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
