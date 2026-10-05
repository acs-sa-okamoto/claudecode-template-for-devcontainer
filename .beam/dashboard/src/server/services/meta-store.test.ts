import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type DatabaseType from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { TaskMeta } from "../../shared/index.js"
import { openAppDb } from "../db/appDb.js"
import { MetaStore } from "./meta-store.js"

// 実 better-sqlite3 + 一時ファイル app.db（スキーマ適用済み）で検証する。

let dir: string
let db: DatabaseType.Database
let store: MetaStore

/** 最小の TaskMeta を作る。 */
function baseMeta(overrides: Partial<TaskMeta> = {}): TaskMeta {
  return {
    project: "projA",
    taskId: 1,
    notionSyncStatus: "not_synced",
    notionPageId: null,
    updateBadge: false,
    isDeleted: false,
    deletedSnapshot: null,
    lastError: null,
    metaUpdatedAt: "2026-06-03T00:00:00Z",
    ...overrides,
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tb-meta-"))
  db = openAppDb(join(dir, "app.db"))
  store = new MetaStore(db)
})

afterEach(() => {
  if (db && db.open) db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe("MetaStore", () => {
  it("TC-01: task_meta の upsert と取得（INSERT/UPDATE 両パス）", () => {
    // 【テスト目的】upsert（database-schema.sql / interfaces.ts）
    // 【テスト内容】新規挿入 → 同キーで更新
    // 【期待される動作】INSERT 後に取得、UPDATE 後に値が変わる
    store.upsertTaskMeta(baseMeta({ updateBadge: true }))
    const got = store.getTaskMeta("projA", 1)
    expect(got?.notionSyncStatus).toBe("not_synced")
    expect(got?.updateBadge).toBe(true)

    store.upsertTaskMeta(baseMeta({ notionSyncStatus: "synced", updateBadge: false }))
    const updated = store.getTaskMeta("projA", 1)
    expect(updated?.notionSyncStatus).toBe("synced")
    expect(updated?.updateBadge).toBe(false)
  })

  it("TC-02: 楽観ロックで二重登録を防ぐ", () => {
    // 【テスト目的】楽観ロック（EDGE-202）
    // 【期待される動作】1回目 true、2回目 false、ステータス syncing
    store.upsertTaskMeta(baseMeta())
    const first = store.tryAcquireSyncLock("projA", 1)
    const second = store.tryAcquireSyncLock("projA", 1)
    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(store.getTaskMeta("projA", 1)?.notionSyncStatus).toBe("syncing")
  })

  it("TC-03: スナップショット保存/復元", () => {
    // 【テスト目的】削除スナップショット（REQ-105）
    store.upsertTaskMeta(baseMeta({ notionSyncStatus: "synced" }))
    store.saveDeletedSnapshot("projA", 1, {
      title: "T",
      content: "C",
      status: "done",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
    })
    const got = store.getTaskMeta("projA", 1)
    expect(got?.isDeleted).toBe(true)
    expect(got?.deletedSnapshot).toEqual({
      title: "T",
      content: "C",
      status: "done",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
    })
  })

  it("TC-04: settings 永続化", () => {
    // 【テスト目的】settings（REQ-201〜203）
    // 【期待される動作】既定 true → false に変更が永続化
    expect(store.getNotificationsEnabled()).toBe(true)
    store.setNotificationsEnabled(false)
    expect(store.getNotificationsEnabled()).toBe(false)
    store.setNotificationsEnabled(true)
    expect(store.getNotificationsEnabled()).toBe(true)
  })

  it("TC-05: notion_project の upsert と取得", () => {
    // 【テスト目的】notion_project（REQ-111）
    expect(store.getNotionProject("projA")).toBeNull()
    store.upsertNotionProject("projA", "db-123")
    expect(store.getNotionProject("projA")?.notionDatabaseId).toBe("db-123")
    // 再 upsert で更新
    store.upsertNotionProject("projA", "db-456")
    expect(store.getNotionProject("projA")?.notionDatabaseId).toBe("db-456")
  })

  it("TC-06: sync_job の作成・更新・取得", () => {
    // 【テスト目的】sync_job（REQ-011）
    store.createSyncJob("job1", "projA", 5)
    let job = store.getSyncJob("job1")
    expect(job?.total).toBe(5)
    expect(job?.status).toBe("running")
    store.updateSyncJob("job1", { done: 3, failed: 1, status: "completed" })
    job = store.getSyncJob("job1")
    expect(job?.done).toBe(3)
    expect(job?.failed).toBe(1)
    expect(job?.status).toBe("completed")
  })

  it("TC-07: markSynced / markSyncFailed / setNotionPageId", () => {
    // 【テスト目的】ステータス更新（REQ-105/109）
    store.upsertTaskMeta(baseMeta({ notionSyncStatus: "syncing" }))
    store.markSynced("projA", 1, "page-xyz")
    let m = store.getTaskMeta("projA", 1)
    expect(m?.notionSyncStatus).toBe("synced")
    expect(m?.notionPageId).toBe("page-xyz")

    store.upsertTaskMeta(baseMeta({ taskId: 2, notionSyncStatus: "syncing" }))
    store.markSyncFailed("projA", 2, "boom")
    m = store.getTaskMeta("projA", 2)
    expect(m?.notionSyncStatus).toBe("sync_failed")
    expect(m?.lastError).toBe("boom")
  })

  it("TC-08: listTaskMeta / listTaskMetaByProject", () => {
    // 【テスト目的】一覧取得
    store.upsertTaskMeta(baseMeta({ project: "projA", taskId: 1 }))
    store.upsertTaskMeta(baseMeta({ project: "projA", taskId: 2 }))
    store.upsertTaskMeta(baseMeta({ project: "projB", taskId: 1 }))
    expect(store.listTaskMeta()).toHaveLength(3)
    expect(store.listTaskMetaByProject("projA")).toHaveLength(2)
  })

  it("TC-E01: CHECK 制約に沿った値のみ受理", () => {
    // 【テスト目的】CHECK 制約（database-schema.sql）
    // 【期待される動作】enum 外の値は throw
    expect(() => {
      store.upsertTaskMeta(
        baseMeta({ notionSyncStatus: "bogus" as TaskMeta["notionSyncStatus"] }),
      )
    }).toThrow()
  })

  it("TC-E02: 楽観ロック対象外ステータスは取得失敗", () => {
    // 【テスト目的】楽観ロック分岐（EDGE-202）
    store.upsertTaskMeta(baseMeta({ notionSyncStatus: "synced" }))
    expect(store.tryAcquireSyncLock("projA", 1)).toBe(false)
  })

  it("TC-B01: 未登録 task_meta の取得は null", () => {
    expect(store.getTaskMeta("nope", 99)).toBeNull()
  })

  it("TC-B02: 未登録 notion_project / sync_job は null", () => {
    expect(store.getNotionProject("nope")).toBeNull()
    expect(store.getSyncJob("nope")).toBeNull()
  })

  it("TC-INT-01: 実 app.db に対する CRUD と楽観ロック（統合）", () => {
    // 【テスト目的】統合（REQ-404 / EDGE-202）
    store.upsertTaskMeta(baseMeta({ notionSyncStatus: "not_synced" }))
    expect(store.tryAcquireSyncLock("projA", 1)).toBe(true)
    expect(store.tryAcquireSyncLock("projA", 1)).toBe(false)
    store.markSynced("projA", 1, "p1")
    store.saveDeletedSnapshot("projA", 1, {
      title: "T",
      content: "C",
      status: "ready",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    })
    const m = store.getTaskMeta("projA", 1)
    expect(m?.notionPageId).toBe("p1")
    expect(m?.isDeleted).toBe(true)
    expect(m?.deletedSnapshot?.title).toBe("T")
  })

  it("TC-BADGE-01: setUpdateBadge はメタ未存在でも最小行を作って badge=1（TASK-0017/REQ-010）", () => {
    // 【テスト目的】hook が一覧読込より先に来てもバッジを取りこぼさないこと。
    // 【テスト内容】未存在の (projA,9) に setUpdateBadge。
    // 【期待される動作】not_synced の行が作られ update_badge=true。
    store.setUpdateBadge("projA", 9)
    const m = store.getTaskMeta("projA", 9)
    expect(m?.updateBadge).toBe(true)
    expect(m?.notionSyncStatus).toBe("not_synced")
  })

  it("TC-BADGE-02: setUpdateBadge は既存行の状態を保ちつつ badge=1（idempotent upsert）", () => {
    // 【テスト目的】既存の sync 状態・notion_page_id を壊さず badge のみ立てること。
    // 【テスト内容】synced + page_id の行に setUpdateBadge。
    // 【期待される動作】notion_sync_status='synced'・notion_page_id 維持・update_badge=true。
    store.upsertTaskMeta(
      baseMeta({ notionSyncStatus: "synced", notionPageId: "p1", updateBadge: false }),
    )
    store.setUpdateBadge("projA", 1)
    const m = store.getTaskMeta("projA", 1)
    expect(m?.updateBadge).toBe(true)
    expect(m?.notionSyncStatus).toBe("synced")
    expect(m?.notionPageId).toBe("p1")
  })
})
