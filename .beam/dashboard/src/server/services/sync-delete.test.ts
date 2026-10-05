// TASK-0012: 削除同期 syncDelete の単体・統合テスト。
//
// 実 MetaStore（:memory: + schema.sql）+ フェイク NotionClient で検証する。
// 実 Notion API は叩かない。

import Database from "better-sqlite3"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NotionSyncStatus } from "../../shared/index.js"
import { MetaStore } from "./meta-store.js"
import type { NotionClient } from "./notion-client.js"
import { NotionApiError } from "./notion-client.js"
import { syncDelete } from "./sync-delete.js"

const SCHEMA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/schema.sql",
)

const PROJECT = "projA"
const TASK_ID = 7
const PAGE_ID = "page-to-delete"

function makeStore(): MetaStore {
  const db = new Database(":memory:")
  db.pragma("foreign_keys = ON")
  db.exec(readFileSync(SCHEMA_PATH, "utf8"))
  return new MetaStore(db)
}

function seedMeta(
  store: MetaStore,
  status: NotionSyncStatus,
  notionPageId: string | null,
): void {
  store.upsertTaskMeta({
    project: PROJECT,
    taskId: TASK_ID,
    notionSyncStatus: status,
    notionPageId,
    updateBadge: false,
    isDeleted: status === "pending_deletion",
    deletedSnapshot: null,
    lastError: null,
    metaUpdatedAt: "2026-01-01T00:00:00Z",
  })
}

function fakeNotion(overrides: Partial<NotionClient> = {}): NotionClient {
  return {
    createDatabase: vi.fn(async () => "db-x"),
    createPage: vi.fn(async () => "page-x"),
    deletePage: vi.fn(async () => {}),
    ...overrides,
  } as unknown as NotionClient
}

describe("syncDelete", () => {
  let store: MetaStore
  beforeEach(() => {
    store = makeStore()
  })

  it("TC-01: 削除成功 → メタ消去（一覧から消える）", async () => {
    // 【テスト目的】notion_page_id で削除し成功後メタを消去すること（REQ-106）。
    // 【テスト内容】pending_deletion・page_id 有を削除同期。
    // 【期待される動作】deletePage(pageId) 呼出、getTaskMeta が null、status='deleted'。
    seedMeta(store, "pending_deletion", PAGE_ID)
    const notion = fakeNotion()

    const result = await syncDelete({ project: PROJECT, taskId: TASK_ID }, { store, notion })

    expect(result.status).toBe("deleted")
    expect(notion.deletePage).toHaveBeenCalledWith(PAGE_ID)
    expect(store.getTaskMeta(PROJECT, TASK_ID)).toBeNull()
  })

  it("TC-02: 削除 3 回失敗 → sync_failed（メタは残る）", async () => {
    // 【テスト目的】削除失敗で sync_failed へ遷移し再試行可能性を保つ（NFR-301）。
    // 【テスト内容】deletePage が throw。
    // 【期待される動作】sync_failed、last_error 記録、メタは残存。
    seedMeta(store, "pending_deletion", PAGE_ID)
    const notion = fakeNotion({
      deletePage: vi.fn(async () => {
        throw new NotionApiError("Notion API がサーバーエラーを返しました", { status: 500 })
      }),
    })

    const result = await syncDelete({ project: PROJECT, taskId: TASK_ID }, { store, notion })

    expect(result.status).toBe("sync_failed")
    expect(result.error).toBeTruthy()
    expect(store.getTaskMeta(PROJECT, TASK_ID)?.notionSyncStatus).toBe("sync_failed")
    expect(store.getTaskMeta(PROJECT, TASK_ID)?.lastError).toBeTruthy()
  })

  it("TC-03: notion_page_id=null → 削除スキップしメタ消去（取りこぼし防止）", async () => {
    // 【テスト目的】page_id が無い場合の方針一貫性（取りこぼさない）。
    // 【テスト内容】page_id=null の pending_deletion を削除同期。
    // 【期待される動作】deletePage 非呼出、メタ消去、status='deleted'。
    seedMeta(store, "pending_deletion", null)
    const notion = fakeNotion()

    const result = await syncDelete({ project: PROJECT, taskId: TASK_ID }, { store, notion })

    expect(result.status).toBe("deleted")
    expect(notion.deletePage).not.toHaveBeenCalled()
    expect(store.getTaskMeta(PROJECT, TASK_ID)).toBeNull()
  })

  it("TC-04: メタ未登録 → 削除対象外（deletePage 非呼出）", async () => {
    // 【テスト目的】対象が存在しない場合に NotionClient を呼ばないこと。
    // 【テスト内容】task_meta を作らずに削除同期。
    // 【期待される動作】deletePage 非呼出、skipped 相当。
    const notion = fakeNotion()

    const result = await syncDelete({ project: PROJECT, taskId: TASK_ID }, { store, notion })

    expect(result.status).toBe("not_synced")
    expect(notion.deletePage).not.toHaveBeenCalled()
  })

  it("TC-05: pending_deletion でない → 削除対象外（現状返却）", async () => {
    // 【テスト目的】削除対象でないタスクを誤って削除しないこと。
    // 【テスト内容】synced のタスクを削除同期。
    // 【期待される動作】deletePage 非呼出、現状 status を返す、メタ残存。
    seedMeta(store, "synced", PAGE_ID)
    const notion = fakeNotion()

    const result = await syncDelete({ project: PROJECT, taskId: TASK_ID }, { store, notion })

    expect(result.status).toBe("synced")
    expect(notion.deletePage).not.toHaveBeenCalled()
    expect(store.getTaskMeta(PROJECT, TASK_ID)).not.toBeNull()
  })

  it("TC-06: last_error にトークン・本文を含まない", async () => {
    // 【テスト目的】機密が last_error に漏れないこと（NFR-006/P0）。
    seedMeta(store, "pending_deletion", PAGE_ID)
    const notion = fakeNotion({
      deletePage: vi.fn(async () => {
        throw new NotionApiError("Notion API がエラーを返しました (status=400)", { status: 400 })
      }),
    })

    await syncDelete({ project: PROJECT, taskId: TASK_ID }, { store, notion })

    const lastError = store.getTaskMeta(PROJECT, TASK_ID)?.lastError ?? ""
    expect(lastError).not.toContain("Bearer")
    expect(lastError.length).toBeGreaterThan(0)
  })
})
