// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import type { ProjectGroup, TaskView } from "../../shared/index.js"
import { EMPTY_MESSAGE, renderList } from "./list.js"

function makeTask(taskId: string): TaskView {
  return {
    taskId,
    project: "p",
    title: `t${taskId}`,
    content: "",
    status: "ready",
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    notionSyncStatus: "not_synced",
    isDeleted: false,
    updateBadge: false,
  }
}

describe("renderList", () => {
  it("TC-B01: 空配列で空状態メッセージを表示しエラーにならない", () => {
    // 【テスト目的】空一覧時に空状態を表示する（EDGE-101）
    // 【テスト内容】projects:[] を描画
    // 【期待される動作】空状態メッセージが表示される
    const container = document.createElement("div")
    renderList(container, [])
    const empty = container.querySelector('[data-testid="empty-state"]')
    expect(empty?.textContent).toBe(EMPTY_MESSAGE)
  })

  it("複数グループを描画する", () => {
    const groups: ProjectGroup[] = [
      { project: "a", notionLinked: false, tasks: [makeTask("1")] },
      { project: "b", notionLinked: true, tasks: [makeTask("2")] },
    ]
    const container = document.createElement("div")
    renderList(container, groups)
    expect(container.querySelectorAll(".project-group").length).toBe(2)
  })

  it("TC-B02: 1000 件を 5 秒以内に描画する（NFR-001）", () => {
    // 【テスト目的】1000 件描画の性能（NFR-001）
    // 【テスト内容】1000 件のタスクを 1 グループで描画し時間計測
    // 【期待される動作】5 秒（5000ms）以内に完了
    const tasks = Array.from({ length: 1000 }, (_, i) => makeTask(String(i + 1)))
    const groups: ProjectGroup[] = [
      { project: "big", notionLinked: false, tasks },
    ]
    const container = document.createElement("div")
    const start = performance.now()
    renderList(container, groups)
    const elapsed = performance.now() - start
    expect(container.querySelectorAll(".task-row").length).toBe(1000)
    expect(elapsed).toBeLessThan(5000)
  })
})
