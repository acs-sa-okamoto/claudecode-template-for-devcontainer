import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import type DatabaseType from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { TaskMeta } from "../../shared/index.js"
import { openAppDb } from "../db/appDb.js"
import { MetaStore } from "./meta-store.js"
import { TaskReader } from "./task-reader.js"
import { mergeTasks } from "./task-merger.js"

// 実 TaskReader + 実 MetaStore（一時ファイル DB）でマージ・削除検知を検証する。

let dir: string
let sourcePath: string
let appDb: DatabaseType.Database
let store: MetaStore

/** ソース DB を任意のタスクで作る。 */
function createSource(
  tables: Record<
    string,
    Array<{ taskId: number; title?: string; content?: string; status?: string }>
  >,
): void {
  const db = new Database(sourcePath)
  for (const [name, rows] of Object.entries(tables)) {
    db.exec(
      `CREATE TABLE "${name}" (task_id INTEGER PRIMARY KEY, title TEXT NOT NULL, content TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`,
    )
    const ins = db.prepare(
      `INSERT INTO "${name}"(task_id, title, content, status, created_at, updated_at) VALUES(?,?,?,?,?,?)`,
    )
    for (const r of rows) {
      ins.run(
        r.taskId,
        r.title ?? `t-${r.taskId}`,
        r.content ?? "c",
        r.status ?? "ready",
        "2026-01-01T00:00:00Z",
        "2026-01-02T00:00:00Z",
      )
    }
  }
  db.close()
}

function meta(overrides: Partial<TaskMeta>): TaskMeta {
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
  dir = mkdtempSync(join(tmpdir(), "tb-merge-"))
  sourcePath = join(dir, "source.db")
  appDb = openAppDb(join(dir, "app.db"))
  store = new MetaStore(appDb)
})

afterEach(() => {
  if (appDb && appDb.open) appDb.close()
  rmSync(dir, { recursive: true, force: true })
})

describe("mergeTasks", () => {
  it("TC-01: 通常タスクのマージ", () => {
    createSource({ projA: [{ taskId: 1, status: "in_progress" }] })
    store.upsertTaskMeta(meta({ notionSyncStatus: "synced", updateBadge: true, notionPageId: "p1" }))
    const reader = new TaskReader(sourcePath)
    const groups = mergeTasks(reader, store)
    reader.close()
    const view = groups[0]?.tasks[0]
    expect(view?.taskId).toBe(1)
    expect(view?.status).toBe("in_progress")
    expect(view?.notionSyncStatus).toBe("synced")
    expect(view?.updateBadge).toBe(true)
    expect(view?.isDeleted).toBe(false)
  })

  it("TC-02: メタ未登録のソースタスクは not_synced で新規メタ作成", () => {
    createSource({ projA: [{ taskId: 5 }] })
    const reader = new TaskReader(sourcePath)
    const groups = mergeTasks(reader, store)
    reader.close()
    expect(groups[0]?.tasks[0]?.notionSyncStatus).toBe("not_synced")
    // メタ行が作られている
    expect(store.getTaskMeta("projA", 5)).not.toBeNull()
  })

  it("TC-03: task_id 昇順グルーピング（project 昇順）", () => {
    createSource({
      projB: [{ taskId: 2 }, { taskId: 1 }],
      projA: [{ taskId: 3 }, { taskId: 1 }],
    })
    const reader = new TaskReader(sourcePath)
    const groups = mergeTasks(reader, store)
    reader.close()
    expect(groups.map((g) => g.project)).toEqual(["projA", "projB"])
    expect(groups[0]?.tasks.map((t) => t.taskId)).toEqual([1, 3])
    expect(groups[1]?.tasks.map((t) => t.taskId)).toEqual([1, 2])
  })

  it("TC-04: notionLinked が notion_project 登録有無を反映", () => {
    createSource({ projA: [{ taskId: 1 }], projB: [{ taskId: 1 }] })
    store.upsertNotionProject("projA", "db-1")
    const reader = new TaskReader(sourcePath)
    const groups = mergeTasks(reader, store)
    reader.close()
    const byName = Object.fromEntries(groups.map((g) => [g.project, g]))
    expect(byName.projA?.notionLinked).toBe(true)
    expect(byName.projB?.notionLinked).toBe(false)
  })

  it("TC-05: synced 削除 → pending_deletion＋スナップショット・一覧に残る", () => {
    // ソースに無い synced タスク（直前まで synced だったもの）
    createSource({ projA: [{ taskId: 1 }] }) // task 2 は存在しない
    store.upsertTaskMeta(meta({ taskId: 2, notionSyncStatus: "synced", notionPageId: "p2" }))
    const reader = new TaskReader(sourcePath)
    const groups = mergeTasks(reader, store)
    reader.close()
    const deleted = groups[0]?.tasks.find((t) => t.taskId === 2)
    expect(deleted).toBeDefined()
    expect(deleted?.isDeleted).toBe(true)
    expect(deleted?.notionSyncStatus).toBe("pending_deletion")
    // メタは残り、スナップショットが保持される
    const m = store.getTaskMeta("projA", 2)
    expect(m?.isDeleted).toBe(true)
    expect(m?.deletedSnapshot).not.toBeNull()
  })

  it("TC-06: not_synced 削除 → 物理削除・一覧に含まれない", () => {
    createSource({ projA: [{ taskId: 1 }] })
    store.upsertTaskMeta(meta({ taskId: 9, notionSyncStatus: "not_synced" }))
    const reader = new TaskReader(sourcePath)
    const groups = mergeTasks(reader, store)
    reader.close()
    expect(groups[0]?.tasks.find((t) => t.taskId === 9)).toBeUndefined()
    expect(store.getTaskMeta("projA", 9)).toBeNull()
  })

  it("TC-07: 既存 pending_deletion は再走査でも一覧に残る", () => {
    createSource({ projA: [{ taskId: 1 }] })
    // 既に pending_deletion でスナップショット済み
    store.upsertTaskMeta(meta({ taskId: 3, notionSyncStatus: "synced" }))
    store.saveDeletedSnapshot("projA", 3, {
      title: "deleted",
      content: "x",
      status: "done",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    })
    const reader = new TaskReader(sourcePath)
    const groups = mergeTasks(reader, store)
    reader.close()
    const view = groups[0]?.tasks.find((t) => t.taskId === 3)
    expect(view?.notionSyncStatus).toBe("pending_deletion")
    expect(view?.title).toBe("deleted")
  })

  it("TC-08: syncing 中にソース消失しても物理削除しない", () => {
    createSource({ projA: [{ taskId: 1 }] })
    store.upsertTaskMeta(meta({ taskId: 7, notionSyncStatus: "syncing" }))
    const reader = new TaskReader(sourcePath)
    mergeTasks(reader, store)
    reader.close()
    expect(store.getTaskMeta("projA", 7)).not.toBeNull()
  })

  it("TC-B01: ソース 0 件・メタ 0 件で空配列", () => {
    createSource({})
    // テーブルが 1 つも無いとファイルが空になり fileMustExist で失敗するため補助テーブルを置く
    const d = new Database(sourcePath)
    d.exec("CREATE TABLE aux (k TEXT PRIMARY KEY);")
    d.close()
    const reader = new TaskReader(sourcePath)
    const groups = mergeTasks(reader, store)
    reader.close()
    expect(groups).toEqual([])
  })

  it("TC-INT-01: 実 DB でのマージ結果（統合）", () => {
    createSource({ projA: [{ taskId: 1, status: "ready" }, { taskId: 2 }] })
    // 既存メタ: task1 synced（残る）, task10 synced 削除（pending）, task11 not_synced 削除（消去）
    store.upsertTaskMeta(meta({ taskId: 1, notionSyncStatus: "synced", notionPageId: "p1" }))
    store.upsertTaskMeta(meta({ taskId: 10, notionSyncStatus: "synced", notionPageId: "p10" }))
    store.upsertTaskMeta(meta({ taskId: 11, notionSyncStatus: "not_synced" }))
    const reader = new TaskReader(sourcePath)
    const groups = mergeTasks(reader, store)
    reader.close()
    const ids = groups[0]?.tasks.map((t) => t.taskId)
    expect(ids).toEqual([1, 2, 10]) // 11 は消去、10 は pending で残り昇順
    const t10 = groups[0]?.tasks.find((t) => t.taskId === 10)
    expect(t10?.isDeleted).toBe(true)
    expect(store.getTaskMeta("projA", 11)).toBeNull()
  })
})
