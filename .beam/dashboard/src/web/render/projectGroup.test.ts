// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import type { ProjectGroup, TaskView } from "../../shared/index.js"
import { renderProjectGroup, sortByTaskId } from "./projectGroup.js"

// テスト用の最小 TaskView を生成するヘルパ。
function makeTask(over: Partial<TaskView>): TaskView {
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

describe("renderProjectGroup", () => {
  it("TC-01: プロジェクト見出し（h2）付きで section を描画する", () => {
    // 【テスト目的】ProjectGroup が見出し要素付きで描画されること（REQ-002）
    // 【テスト内容】project 名を持つ group を描画し見出しを確認
    // 【期待される動作】h2 にプロジェクト名が入り section の data-project に一致
    const group: ProjectGroup = {
      project: "alpha",
      notionLinked: false,
      tasks: [makeTask({ taskId: "1" })],
    }
    const section = renderProjectGroup(group)
    const heading = section.querySelector("h2")
    expect(heading).not.toBeNull()
    expect(heading?.textContent).toBe("alpha")
    expect(section.dataset.project).toBe("alpha")
  })

  it("TC-02: 行が task_id 昇順に並ぶ", () => {
    // 【テスト目的】グループ内のタスクが task_id 昇順で描画される（REQ-003）
    // 【テスト内容】順不同の tasks を描画し DOM 順を確認
    // 【期待される動作】data-task-id が 1,2,3 の順
    const group: ProjectGroup = {
      project: "alpha",
      notionLinked: false,
      tasks: [
        makeTask({ taskId: "3" }),
        makeTask({ taskId: "1" }),
        makeTask({ taskId: "2" }),
      ],
    }
    const section = renderProjectGroup(group)
    const ids = Array.from(
      section.querySelectorAll<HTMLElement>(".task-row"),
    ).map((r) => r.dataset.taskId)
    expect(ids).toEqual(["1", "2", "3"])
  })

  it("TC-04: title を textContent で安全に描画し img 要素を生成しない（XSS 防止）", () => {
    // 【テスト目的】外部由来文字列を textContent で挿入し XSS を防ぐ（P0）
    // 【テスト内容】悪意ある HTML 文字列を title に含めて描画
    // 【期待される動作】文字列として表示され img 子要素が生成されない
    const group: ProjectGroup = {
      project: "alpha",
      notionLinked: false,
      tasks: [makeTask({ title: "<img src=x onerror=alert(1)>" })],
    }
    const section = renderProjectGroup(group)
    expect(section.querySelector("img")).toBeNull()
    const title = section.querySelector<HTMLElement>(".row-title")
    expect(title?.textContent).toBe("<img src=x onerror=alert(1)>")
  })

  it("change 2: 列見出しを指定順で表示する", () => {
    // 【テスト目的】表ヘッダが REQ-002 の列順（+操作）で並ぶこと
    const group: ProjectGroup = { project: "alpha", notionLinked: false, tasks: [] }
    const section = renderProjectGroup(group)
    const headers = Array.from(section.querySelectorAll("thead th")).map(
      (th) => th.textContent,
    )
    expect(headers).toEqual([
      "タスクID",
      "タイトル",
      "内容",
      "作成日時",
      "更新日時",
      "ステータス",
      "Notion連携",
      "削除",
      "更新",
      "操作",
    ])
  })
})

describe("sortByTaskId", () => {
  it("元配列を破壊せず昇順ソートした新配列を返す", () => {
    const tasks = [makeTask({ taskId: "2" }), makeTask({ taskId: "1" })]
    const sorted = sortByTaskId(tasks)
    expect(sorted.map((t) => t.taskId)).toEqual(["1", "2"])
    expect(tasks.map((t) => t.taskId)).toEqual(["2", "1"])
  })
})
