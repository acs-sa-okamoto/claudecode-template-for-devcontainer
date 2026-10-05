// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import type { TaskView } from "../../shared/index.js"
import { renderRow } from "../render/row.js"
import { applySyncError, SYNC_FAILED_MESSAGE } from "./syncError.js"

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

describe("applySyncError", () => {
  it("TC-02: sync_failed の行に日本語エラーメッセージを付与する", () => {
    // 【テスト目的】連携失敗を行に可視化（REQ-109/AC-11/NFR-302）
    const row = renderRow(makeTask({ notionSyncStatus: "sync_failed" }), applySyncError)
    const err = row.querySelector('[data-testid="row-error"]')
    expect(err?.textContent).toBe(SYNC_FAILED_MESSAGE)
    expect(err?.getAttribute("role")).toBe("alert")
  })

  it("sync_failed 以外の行にはエラーを付けない", () => {
    const row = renderRow(makeTask({ notionSyncStatus: "synced" }), applySyncError)
    expect(row.querySelector('[data-testid="row-error"]')).toBeNull()
  })

  it("TC-03: メッセージが日本語である（NFR-201）", () => {
    expect(/[ぁ-んァ-ン一-龯]/.test(SYNC_FAILED_MESSAGE)).toBe(true)
  })

  it("重複付与しない", () => {
    const task = makeTask({ notionSyncStatus: "sync_failed" })
    const row = renderRow(task, applySyncError)
    applySyncError(row, task)
    expect(row.querySelectorAll('[data-testid="row-error"]').length).toBe(1)
  })
})
