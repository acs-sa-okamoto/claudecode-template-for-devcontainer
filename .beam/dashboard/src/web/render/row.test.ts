// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import type { TaskView } from "../../shared/index.js"
import {
  findRow,
  markRowUpdated,
  renderRow,
  ROW_DELETED_CLASS,
  ROW_UPDATED_CLASS,
} from "./row.js"

function makeTask(over: Partial<TaskView> = {}): TaskView {
  return {
    taskId: "1",
    project: "task-bridge",
    title: "タイトル",
    content: "本文",
    status: "ready",
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    notionSyncStatus: "not_synced",
    isDeleted: false,
    updateBadge: false,
    ...over,
  }
}

describe("renderRow", () => {
  it("status と sync のバッジを表示する", () => {
    const row = renderRow(makeTask({ status: "in_progress" }))
    const badges = row.querySelectorAll(".badge")
    expect(badges.length).toBe(2)
    expect(row.querySelector('[data-testid="status-badge"]')?.textContent).toBe(
      "進行中",
    )
  })

  it("TC-03: pending_deletion で取り消し線クラスが付く", () => {
    // 【テスト目的】削除待ち行に取り消し線（REQ-105/AC-13）
    const row = renderRow(makeTask({ notionSyncStatus: "pending_deletion" }))
    expect(row.classList.contains(ROW_DELETED_CLASS)).toBe(true)
  })

  it("TC-03b: isDeleted で取り消し線クラスが付く", () => {
    const row = renderRow(makeTask({ isDeleted: true }))
    expect(row.classList.contains(ROW_DELETED_CLASS)).toBe(true)
  })

  it("TC-04: updateBadge でハイライトクラスが付く", () => {
    // 【テスト目的】更新行にハイライト（REQ-010/AC-12）
    const row = renderRow(makeTask({ updateBadge: true }))
    expect(row.classList.contains(ROW_UPDATED_CLASS)).toBe(true)
  })

  it("TC-B01: 取り消し線とハイライトは併用できる", () => {
    const row = renderRow(makeTask({ isDeleted: true, updateBadge: true }))
    expect(row.classList.contains(ROW_DELETED_CLASS)).toBe(true)
    expect(row.classList.contains(ROW_UPDATED_CLASS)).toBe(true)
  })

  it("enhancer で行を拡張できる", () => {
    const row = renderRow(makeTask(), (r) => {
      r.dataset.enhanced = "yes"
    })
    expect(row.dataset.enhanced).toBe("yes")
  })

  it("change 2: 9 列を指定順で表示する（task_id..update_badge + 操作列）", () => {
    // 【テスト目的】REQ-002 の 9 項目を指定順で列表示する（列挙を項目単位で検証）
    const task = makeTask({
      taskId: "TASK-0007",
      title: "タイトル",
      content: "本文",
      status: "in_progress",
      createdAt: "2026-06-01 10:00:00",
      updatedAt: "2026-06-02 11:00:00",
      notionSyncStatus: "synced",
      isDeleted: false,
      updateBadge: true,
    })
    const cells = renderRow(task).querySelectorAll("td")
    expect(cells.length).toBe(10) // 9 データ列 + 操作列
    expect(cells[0]?.textContent).toBe("TASK-0007") // task_id
    expect(cells[1]?.textContent).toBe("タイトル") // title
    expect(cells[2]?.textContent).toBe("本文") // content
    expect(cells[3]?.textContent).toBe("2026-06-01 10:00:00") // created_at
    expect(cells[4]?.textContent).toBe("2026-06-02 11:00:00") // updated_at
    expect(
      cells[5]?.querySelector('[data-testid="status-badge"]')?.textContent,
    ).toBe("進行中") // status
    expect(
      cells[6]?.querySelector('[data-testid="sync-badge"]')?.textContent,
    ).toBe("登録済") // notion_sync_status
    expect(cells[7]?.textContent).toBe("—") // is_deleted=false
    expect(cells[8]?.textContent).toBe("あり") // update_badge=true
    expect(cells[9]?.classList.contains("row-actions")).toBe(true) // 操作
  })

  it("change 3: 削除カラムは ✓／—、更新カラムは あり/なし で表示する", () => {
    // 【テスト目的】is_deleted=✓／—、update_badge=あり/なし（両分岐を検証）
    const onDel = renderRow(
      makeTask({ isDeleted: true, updateBadge: false }),
    ).querySelectorAll("td")
    expect(onDel[7]?.textContent).toBe("✓") // is_deleted=true
    expect(onDel[8]?.textContent).toBe("なし") // update_badge=false

    const offDel = renderRow(
      makeTask({ isDeleted: false, updateBadge: true }),
    ).querySelectorAll("td")
    expect(offDel[7]?.textContent).toBe("—") // is_deleted=false
    expect(offDel[8]?.textContent).toBe("あり") // update_badge=true
  })
})

describe("findRow / markRowUpdated", () => {
  it("project/taskId で行を特定しハイライトを付与する", () => {
    const container = document.createElement("div")
    container.appendChild(renderRow(makeTask({ taskId: "5", project: "p1" })))
    container.appendChild(renderRow(makeTask({ taskId: "6", project: "p1" })))
    expect(findRow(container, "p1", "5")).not.toBeNull()
    markRowUpdated(container, "p1", "6")
    expect(
      findRow(container, "p1", "6")?.classList.contains(ROW_UPDATED_CLASS),
    ).toBe(true)
    expect(
      findRow(container, "p1", "5")?.classList.contains(ROW_UPDATED_CLASS),
    ).toBe(false)
  })
})
