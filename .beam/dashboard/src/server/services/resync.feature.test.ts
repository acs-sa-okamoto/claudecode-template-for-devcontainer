// 再同期＆「更新あり」差分算出 機能テスト。
//
// 事象修正の検証:
//  ① 同期済みでも内容/ステータスが変わったら再登録できる（既存ページを updatePage で更新。重複作成しない）。
//  ② ステータス変更が「更新あり」になる（hook ではなく、同期時スナップショットとの差分で算出）。

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import Database from "better-sqlite3"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SourceTask, TaskView } from "../../shared/index.js"
import { MetaStore } from "./meta-store.js"
import type { NotionClient } from "./notion-client.js"
import { mergeTasks, type SourceTaskProvider } from "./task-merger.js"
import { syncOne, type SourceTaskLookup } from "./sync-one.js"

const SCHEMA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/schema.sql",
)
const PROJECT = "projA"
const TASK = "TASK-0001"

function makeStore(): MetaStore {
  const db = new Database(":memory:")
  db.pragma("foreign_keys = ON")
  db.exec(readFileSync(SCHEMA_PATH, "utf8"))
  return new MetaStore(db)
}

function task(over: Partial<SourceTask> = {}): SourceTask {
  return {
    taskId: TASK,
    project: PROJECT,
    title: "T",
    content: "C",
    status: "in_progress",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    ...over,
  }
}

function fakeNotion(over: Partial<NotionClient> = {}): NotionClient {
  return {
    createDatabase: vi.fn(async () => "db-1"),
    createPage: vi.fn(async () => "page-1"),
    updatePage: vi.fn(async () => {}),
    deletePage: vi.fn(async () => {}),
    ...over,
  } as unknown as NotionClient
}

const lookupOf = (tasks: SourceTask[]): SourceTaskLookup => ({
  readProjectTasks: (p) => (p === PROJECT ? tasks : []),
})
const readerOf = (tasks: SourceTask[]): SourceTaskProvider => ({
  readAllTasks: () => tasks,
})

/** mergeTasks の結果から対象タスクの TaskView を取り出す。 */
function viewOf(store: MetaStore, tasks: SourceTask[]): TaskView | undefined {
  return mergeTasks(readerOf(tasks), store)
    .flatMap((g) => g.tasks)
    .find((t) => t.taskId === TASK)
}

function seed(store: MetaStore) {
  store.upsertNotionProject(PROJECT, "db-1")
  store.upsertTaskMeta({
    project: PROJECT,
    taskId: TASK,
    notionSyncStatus: "not_synced",
    notionPageId: null,
    updateBadge: false,
    isDeleted: false,
    deletedSnapshot: null,
    lastError: null,
    metaUpdatedAt: "x",
  })
}

describe("re-sync & update-badge", () => {
  let store: MetaStore
  beforeEach(() => {
    store = makeStore()
  })

  it("新規登録: createPage で synced・スナップショット保存・badge=0", async () => {
    const t = task()
    seed(store)
    const notion = fakeNotion()
    const r = await syncOne(
      { project: PROJECT, taskId: TASK },
      { store, notion, lookup: lookupOf([t]) },
    )
    expect(r.status).toBe("synced")
    expect(notion.createPage).toHaveBeenCalledTimes(1)
    expect(notion.updatePage).not.toHaveBeenCalled()
    const m = store.getTaskMeta(PROJECT, TASK)
    expect(m?.notionPageId).toBe("page-1")
    expect(m?.updateBadge).toBe(false)
    expect(m?.deletedSnapshot?.status).toBe("in_progress")
  })

  it("①同期済み＋変化あり: updatePage で既存ページ更新（createPage は呼ばない）", async () => {
    seed(store)
    await syncOne(
      { project: PROJECT, taskId: TASK },
      { store, notion: fakeNotion(), lookup: lookupOf([task({ status: "in_progress" })]) },
    )
    const changed = task({ status: "done" })
    const notion = fakeNotion()
    const r = await syncOne(
      { project: PROJECT, taskId: TASK },
      { store, notion, lookup: lookupOf([changed]) },
    )
    expect(r.status).toBe("synced")
    expect(notion.updatePage).toHaveBeenCalledWith("page-1", changed)
    expect(notion.createPage).not.toHaveBeenCalled()
    const m = store.getTaskMeta(PROJECT, TASK)
    expect(m?.deletedSnapshot?.status).toBe("done")
    expect(m?.updateBadge).toBe(false)
  })

  it("同期済み＋無変化: NotionClient を一切呼ばない", async () => {
    seed(store)
    await syncOne(
      { project: PROJECT, taskId: TASK },
      { store, notion: fakeNotion(), lookup: lookupOf([task()]) },
    )
    const notion = fakeNotion()
    const r = await syncOne(
      { project: PROJECT, taskId: TASK },
      { store, notion, lookup: lookupOf([task()]) },
    )
    expect(r.status).toBe("synced")
    expect(notion.createPage).not.toHaveBeenCalled()
    expect(notion.updatePage).not.toHaveBeenCalled()
  })

  it("②mergeTasks: 同期済み＋ソース変化 → updateBadge=true を算出し列へ materialize", async () => {
    seed(store)
    await syncOne(
      { project: PROJECT, taskId: TASK },
      { store, notion: fakeNotion(), lookup: lookupOf([task({ status: "in_progress" })]) },
    )
    // 無変化 → false
    expect(viewOf(store, [task({ status: "in_progress" })])?.updateBadge).toBe(false)
    // status 変化 → true（＋列 materialize）
    expect(viewOf(store, [task({ status: "done" })])?.updateBadge).toBe(true)
    expect(store.getTaskMeta(PROJECT, TASK)?.updateBadge).toBe(true)
  })

  it("②mergeTasks: 同期済み＋スナップショット無し（旧データ）→ updateBadge=true（再同期を促す）", () => {
    store.upsertTaskMeta({
      project: PROJECT,
      taskId: TASK,
      notionSyncStatus: "synced",
      notionPageId: "page-x",
      updateBadge: false,
      isDeleted: false,
      deletedSnapshot: null,
      lastError: null,
      metaUpdatedAt: "x",
    })
    expect(viewOf(store, [task()])?.updateBadge).toBe(true)
  })

  it("mergeTasks: 未同期は updateBadge=false", () => {
    const v = viewOf(store, [task()])
    expect(v?.notionSyncStatus).toBe("not_synced")
    expect(v?.updateBadge).toBe(false)
  })

  it("meta-store: markSynced(snapshot)/tryAcquireResyncLock/setUpdateBadgeValue", () => {
    const t = task()
    store.upsertTaskMeta({
      project: PROJECT,
      taskId: TASK,
      notionSyncStatus: "not_synced",
      notionPageId: null,
      updateBadge: true,
      isDeleted: false,
      deletedSnapshot: null,
      lastError: null,
      metaUpdatedAt: "x",
    })
    store.markSynced(PROJECT, TASK, "page-1", {
      title: t.title,
      content: t.content,
      status: t.status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })
    const m = store.getTaskMeta(PROJECT, TASK)
    expect(m?.notionSyncStatus).toBe("synced")
    expect(m?.updateBadge).toBe(false)
    expect(m?.deletedSnapshot?.title).toBe(t.title)

    expect(store.tryAcquireResyncLock(PROJECT, TASK)).toBe(true)
    expect(store.getTaskMeta(PROJECT, TASK)?.notionSyncStatus).toBe("syncing")
    expect(store.tryAcquireResyncLock(PROJECT, TASK)).toBe(false)

    store.setUpdateBadgeValue(PROJECT, TASK, true)
    expect(store.getTaskMeta(PROJECT, TASK)?.updateBadge).toBe(true)
  })
})
