// TASK-0010: 個別同期オーケストレーション syncOne の単体・統合テスト。
//
// 実 MetaStore（in-file ではなく実 SQLite。テスト用に :memory: スキーマ適用）と
// フェイク NotionClient / フェイク SourceTaskLookup を結線して検証する。
// 実 Notion API は叩かない（NotionClient はフェイク注入）。

import Database from "better-sqlite3"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NotionSyncStatus, SourceTask } from "../../shared/index.js"
import { MetaStore } from "./meta-store.js"
import type { NotionClient } from "./notion-client.js"
import { NotionApiError } from "./notion-client.js"
import { syncOne, type SourceTaskLookup } from "./sync-one.js"

const SCHEMA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/schema.sql",
)

const PROJECT = "projA"
const TASK_ID = 42

const sampleTask: SourceTask = {
  taskId: TASK_ID,
  project: PROJECT,
  title: "サンプル",
  content: "本文",
  status: "in_progress",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
}

/** :memory: に schema.sql を適用した MetaStore を作る。 */
function makeStore(): MetaStore {
  const db = new Database(":memory:")
  db.pragma("foreign_keys = ON")
  db.exec(readFileSync(SCHEMA_PATH, "utf8"))
  return new MetaStore(db)
}

/** 指定状態の task_meta を 1 件用意する。 */
function seedMeta(
  store: MetaStore,
  status: NotionSyncStatus,
  notionPageId: string | null = null,
): void {
  store.upsertTaskMeta({
    project: PROJECT,
    taskId: TASK_ID,
    notionSyncStatus: status,
    notionPageId,
    updateBadge: false,
    isDeleted: false,
    deletedSnapshot: null,
    lastError: null,
    metaUpdatedAt: "2026-01-01T00:00:00Z",
  })
}

/** SourceTask を返すフェイク lookup。 */
const lookup: SourceTaskLookup = {
  readProjectTasks: (project) => (project === PROJECT ? [sampleTask] : []),
}

/** createDatabase / createPage / deletePage を差し替え可能なフェイク NotionClient。 */
function fakeNotion(overrides: Partial<NotionClient> = {}): NotionClient {
  return {
    createDatabase: vi.fn(async () => "db-created"),
    createPage: vi.fn(async () => "page-1"),
    deletePage: vi.fn(async () => {}),
    ...overrides,
  } as unknown as NotionClient
}

describe("syncOne", () => {
  let store: MetaStore
  beforeEach(() => {
    store = makeStore()
  })

  it("TC-01: not_synced・Notion DB 既存 → createPage 成功で synced + notionPageId 保存", async () => {
    // 【テスト目的】正常同期で synced へ遷移し page_id が保存されること。
    // 【テスト内容】DB 対応済みプロジェクトの not_synced タスクを同期。
    // 【期待される動作】createDatabase は呼ばれず createPage のみ、synced。
    seedMeta(store, "not_synced")
    store.upsertNotionProject(PROJECT, "db-existing")
    const notion = fakeNotion()

    const result = await syncOne({ project: PROJECT, taskId: TASK_ID }, { store, notion, lookup })

    expect(result.status).toBe("synced")
    expect(result.notionPageId).toBe("page-1")
    expect(notion.createDatabase).not.toHaveBeenCalled()
    expect(notion.createPage).toHaveBeenCalledWith("db-existing", sampleTask)
    expect(store.getTaskMeta(PROJECT, TASK_ID)?.notionSyncStatus).toBe("synced")
    expect(store.getTaskMeta(PROJECT, TASK_ID)?.notionPageId).toBe("page-1")
  })

  it("TC-02: Notion DB 未作成 → createDatabase + upsertNotionProject 後に createPage", async () => {
    // 【テスト目的】DB 自動作成（REQ-111）が初回に走ること。
    // 【テスト内容】notion_project 未登録の状態で同期。
    // 【期待される動作】createDatabase が呼ばれ、database_id が保存され、createPage に渡る。
    seedMeta(store, "not_synced")
    const notion = fakeNotion()

    const result = await syncOne({ project: PROJECT, taskId: TASK_ID }, { store, notion, lookup })

    expect(result.status).toBe("synced")
    expect(notion.createDatabase).toHaveBeenCalledWith(PROJECT)
    expect(store.getNotionProject(PROJECT)?.notionDatabaseId).toBe("db-created")
    expect(notion.createPage).toHaveBeenCalledWith("db-created", sampleTask)
  })

  it("TC-03: createPage 失敗 → sync_failed + last_error 記録", async () => {
    // 【テスト目的】3 回リトライ後の失敗で sync_failed へ遷移すること（REQ-109）。
    // 【テスト内容】createPage が NotionApiError を throw。
    // 【期待される動作】sync_failed、last_error 記録、SyncResult.error あり。
    seedMeta(store, "not_synced")
    store.upsertNotionProject(PROJECT, "db-existing")
    const notion = fakeNotion({
      createPage: vi.fn(async () => {
        throw new NotionApiError("Notion API がサーバーエラーを返しました", { status: 500 })
      }),
    })

    const result = await syncOne({ project: PROJECT, taskId: TASK_ID }, { store, notion, lookup })

    expect(result.status).toBe("sync_failed")
    expect(result.error).toBeTruthy()
    expect(store.getTaskMeta(PROJECT, TASK_ID)?.notionSyncStatus).toBe("sync_failed")
    expect(store.getTaskMeta(PROJECT, TASK_ID)?.lastError).toBeTruthy()
  })

  it("TC-04: 既に syncing → スキップ（NotionClient 非呼び出し）", async () => {
    // 【テスト目的】二重登録防止（EDGE-202）。
    // 【テスト内容】syncing 状態のタスクを同期。
    // 【期待される動作】ロック取得失敗でスキップ、createPage 非呼び出し。
    seedMeta(store, "syncing")
    const notion = fakeNotion()

    const result = await syncOne({ project: PROJECT, taskId: TASK_ID }, { store, notion, lookup })

    expect(result.status).toBe("syncing")
    expect(notion.createPage).not.toHaveBeenCalled()
    expect(notion.createDatabase).not.toHaveBeenCalled()
  })

  it("TC-05: sync_failed から再同期でリトライ → synced", async () => {
    // 【テスト目的】失敗後の再クリックでリトライ可能（REQ-203）。
    // 【テスト内容】sync_failed のタスクを再同期し createPage 成功。
    // 【期待される動作】syncing を経て synced。
    seedMeta(store, "sync_failed")
    store.upsertNotionProject(PROJECT, "db-existing")
    const notion = fakeNotion()

    const result = await syncOne({ project: PROJECT, taskId: TASK_ID }, { store, notion, lookup })

    expect(result.status).toBe("synced")
    expect(notion.createPage).toHaveBeenCalled()
  })

  it("TC-06: メタ未登録 → スキップ（NotionClient 非呼び出し）", async () => {
    // 【テスト目的】対象がメタ未登録のときロック取得不能でスキップ。
    // 【テスト内容】task_meta を作らずに同期。
    // 【期待される動作】createPage 非呼び出し、skipped 相当。
    const notion = fakeNotion()

    const result = await syncOne({ project: PROJECT, taskId: TASK_ID }, { store, notion, lookup })

    expect(result.status).toBe("not_synced")
    expect(notion.createPage).not.toHaveBeenCalled()
  })

  it("TC-07: last_error にトークン・本文を含まない（NotionApiError.message のみ）", async () => {
    // 【テスト目的】機密が last_error に漏れないこと（NFR-006/P0）。
    // 【テスト内容】createPage が NotionApiError を throw。
    // 【期待される動作】last_error は NotionApiError.message。トークン文字列を含まない。
    seedMeta(store, "not_synced")
    store.upsertNotionProject(PROJECT, "db-existing")
    const notion = fakeNotion({
      createPage: vi.fn(async () => {
        throw new NotionApiError("Notion API がエラーを返しました (status=400)", { status: 400 })
      }),
    })

    await syncOne({ project: PROJECT, taskId: TASK_ID }, { store, notion, lookup })

    const lastError = store.getTaskMeta(PROJECT, TASK_ID)?.lastError ?? ""
    expect(lastError).not.toContain("Bearer")
    expect(lastError).not.toContain("secret")
    expect(lastError.length).toBeGreaterThan(0)
  })
})
