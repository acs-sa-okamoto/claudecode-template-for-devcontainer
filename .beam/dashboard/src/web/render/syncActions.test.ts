// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import type { SyncResult, TaskView } from "../../shared/index.js"
import { ApiError } from "../api/client.js"
import { renderRow } from "./row.js"
import { createSyncActions, SYNC_BUTTON_TESTID, DELETE_BUTTON_TESTID } from "./syncActions.js"

function makeTask(over: Partial<TaskView> = {}): TaskView {
  return {
    taskId: "1",
    project: "p",
    title: "t",
    content: "",
    status: "ready",
    createdAt: "x",
    updatedAt: "x",
    notionSyncStatus: "not_synced",
    isDeleted: false,
    updateBadge: false,
    ...over,
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe("createSyncActions (row enhancer)", () => {
  it("TC-05: not_synced の行は個別登録ボタンが活性", () => {
    // 【テスト目的】未登録のみ登録可能（REQ-201）
    const enhancer = createSyncActions({ syncOne: vi.fn(), syncDelete: vi.fn() })
    const row = renderRow(makeTask({ notionSyncStatus: "not_synced" }), enhancer)
    const btn = row.querySelector<HTMLButtonElement>(`[data-testid="${SYNC_BUTTON_TESTID}"]`)
    expect(btn).not.toBeNull()
    expect(btn?.disabled).toBe(false)
  })

  it("TC-06: not_synced 以外は個別登録ボタンが非活性", () => {
    // 【テスト目的】二重登録防止（REQ-201 / EDGE-202）
    const enhancer = createSyncActions({ syncOne: vi.fn(), syncDelete: vi.fn() })
    for (const status of ["synced", "syncing"] as const) {
      const row = renderRow(makeTask({ notionSyncStatus: status }), enhancer)
      const btn = row.querySelector<HTMLButtonElement>(`[data-testid="${SYNC_BUTTON_TESTID}"]`)
      expect(btn?.disabled).toBe(true)
    }
  })

  it("TC-05b: sync_failed の行は個別登録ボタンが活性（再試行・REQ-203）", () => {
    // 【テスト目的】失敗タスクの再登録を許可する（REQ-203 / change 3）
    const enhancer = createSyncActions({ syncOne: vi.fn(), syncDelete: vi.fn() })
    const row = renderRow(makeTask({ notionSyncStatus: "sync_failed" }), enhancer)
    const btn = row.querySelector<HTMLButtonElement>(`[data-testid="${SYNC_BUTTON_TESTID}"]`)
    expect(btn?.disabled).toBe(false)
  })

  it("change 1: 閲覧専用モードでは not_synced でも個別登録ボタンが非活性", () => {
    // 【テスト目的】view モードは Notion 連携不可のため登録不可
    const enhancer = createSyncActions({ syncOne: vi.fn(), syncDelete: vi.fn(), viewMode: true })
    const row = renderRow(makeTask({ notionSyncStatus: "not_synced" }), enhancer)
    const btn = row.querySelector<HTMLButtonElement>(`[data-testid="${SYNC_BUTTON_TESTID}"]`)
    expect(btn?.disabled).toBe(true)
  })

  it("TC-07: 個別登録ボタン押下で syncOne が project/taskId で呼ばれる", async () => {
    // 【テスト目的】押下→個別登録 API 呼び出し（REQ-004）
    const result: SyncResult = { project: "p", taskId: "9", status: "synced" }
    const syncOne = vi.fn(async () => result)
    const enhancer = createSyncActions({ syncOne, syncDelete: vi.fn() })
    const row = renderRow(makeTask({ project: "p", taskId: "9" }), enhancer)
    row.querySelector<HTMLButtonElement>(`[data-testid="${SYNC_BUTTON_TESTID}"]`)?.click()
    await flush()
    expect(syncOne).toHaveBeenCalledWith("p", "9")
  })

  it("TC-E01: 登録失敗でボタンを活性に戻し onError を呼ぶ", async () => {
    // 【テスト目的】失敗時の復帰と通知（REQ-203 再試行可能）
    const syncOne = vi.fn(async () => {
      throw new ApiError("NOTION_SYNC_FAILED", "失敗")
    })
    const onError = vi.fn()
    const enhancer = createSyncActions({ syncOne, syncDelete: vi.fn(), onError })
    const row = renderRow(makeTask({ notionSyncStatus: "not_synced" }), enhancer)
    const btn = row.querySelector<HTMLButtonElement>(`[data-testid="${SYNC_BUTTON_TESTID}"]`)
    btn?.click()
    await flush()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(btn?.disabled).toBe(false)
  })

  it("TC-08: pending_deletion の行に削除同期ボタンが表示される", () => {
    // 【テスト目的】削除同期ボタンの表示（REQ-106）
    const enhancer = createSyncActions({ syncOne: vi.fn(), syncDelete: vi.fn() })
    const row = renderRow(makeTask({ notionSyncStatus: "pending_deletion" }), enhancer)
    expect(row.querySelector(`[data-testid="${DELETE_BUTTON_TESTID}"]`)).not.toBeNull()
  })

  it("TC-09: pending_deletion 以外には削除同期ボタンが無い", () => {
    const enhancer = createSyncActions({ syncOne: vi.fn(), syncDelete: vi.fn() })
    const row = renderRow(makeTask({ notionSyncStatus: "not_synced" }), enhancer)
    expect(row.querySelector(`[data-testid="${DELETE_BUTTON_TESTID}"]`)).toBeNull()
  })

  it("TC-02/TC-E02: 削除同期ボタン押下で syncDelete を呼び、失敗で onError", async () => {
    // 【テスト目的】削除同期の呼び出しと失敗通知（REQ-106）
    const syncDelete = vi.fn(async () => {
      throw new ApiError("NOTION_SYNC_FAILED", "失敗")
    })
    const onError = vi.fn()
    const enhancer = createSyncActions({ syncOne: vi.fn(), syncDelete, onError })
    const row = renderRow(makeTask({ project: "p", taskId: "7", notionSyncStatus: "pending_deletion" }), enhancer)
    row.querySelector<HTMLButtonElement>(`[data-testid="${DELETE_BUTTON_TESTID}"]`)?.click()
    await flush()
    expect(syncDelete).toHaveBeenCalledWith("p", "7")
    expect(onError).toHaveBeenCalledTimes(1)
  })
})
