// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import type { TaskView } from "../../shared/index.js"
import { renderRow, ROW_UPDATED_CLASS } from "../render/row.js"
import { startSseClient, type SseSource } from "./client.js"

// フェイク EventSource。emit() で任意イベントを発火できる。
class FakeEventSource implements SseSource {
  onerror: ((event: Event) => void) | null = null
  closed = false
  private listeners = new Map<string, (event: MessageEvent) => void>()
  constructor(public url: string) {}
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, listener)
  }
  close() {
    this.closed = true
  }
  emit(type: string, data: string) {
    this.listeners.get(type)?.({ data } as MessageEvent)
  }
}

function makeTask(taskId: string, updateBadge = false): TaskView {
  return {
    taskId,
    project: "p1",
    title: `t${taskId}`,
    content: "",
    status: "ready",
    createdAt: "x",
    updatedAt: "x",
    notionSyncStatus: "not_synced",
    isDeleted: false,
    updateBadge,
  }
}

describe("startSseClient", () => {
  it("TC-01: tasks_changed 受信で reload が呼ばれる", async () => {
    // 【テスト目的】SSE 受信で一覧再取得が走る（REQ-010）
    const container = document.createElement("div")
    const reload = vi.fn().mockResolvedValue(undefined)
    let fake!: FakeEventSource
    startSseClient({
      container,
      reload,
      createSource: (url) => (fake = new FakeEventSource(url)),
    })
    fake.emit(
      "tasks_changed",
      JSON.stringify({ type: "tasks_changed", changedTaskIds: [] }),
    )
    await Promise.resolve()
    await Promise.resolve()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("TC-02/TC-E2E-01: 再取得後に changedTaskIds 該当行がハイライトされる", async () => {
    // 【テスト目的】受信→再描画→該当行ハイライト（AC-12）
    const container = document.createElement("div")
    // reload は新しい行を描画する（サーバ再取得を模す）
    const reload = vi.fn().mockImplementation(async () => {
      container.replaceChildren()
      container.appendChild(renderRow(makeTask("1")))
      container.appendChild(renderRow(makeTask("2")))
    })
    let fake!: FakeEventSource
    startSseClient({
      container,
      reload,
      createSource: (url) => (fake = new FakeEventSource(url)),
    })
    fake.emit(
      "tasks_changed",
      JSON.stringify({
        type: "tasks_changed",
        changedTaskIds: [{ project: "p1", taskId: "2" }],
      }),
    )
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    const row2 = container.querySelector<HTMLElement>(
      '.task-row[data-task-id="2"]',
    )
    const row1 = container.querySelector<HTMLElement>(
      '.task-row[data-task-id="1"]',
    )
    expect(row2?.classList.contains(ROW_UPDATED_CLASS)).toBe(true)
    expect(row1?.classList.contains(ROW_UPDATED_CLASS)).toBe(false)
  })

  it("TC-E01: 不正 JSON でも例外で停止しない（reload は呼ばれる）", async () => {
    const container = document.createElement("div")
    const reload = vi.fn().mockResolvedValue(undefined)
    let fake!: FakeEventSource
    startSseClient({
      container,
      reload,
      createSource: (url) => (fake = new FakeEventSource(url)),
    })
    expect(() => fake.emit("tasks_changed", "not-json")).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("TC-E02: onerror が設定されクラッシュしない / stop で close する", () => {
    const container = document.createElement("div")
    let fake!: FakeEventSource
    const client = startSseClient({
      container,
      reload: vi.fn().mockResolvedValue(undefined),
      createSource: (url) => (fake = new FakeEventSource(url)),
    })
    expect(fake.onerror).toBeTypeOf("function")
    expect(() => fake.onerror?.(new Event("error"))).not.toThrow()
    client.stop()
    expect(fake.closed).toBe(true)
  })
})
