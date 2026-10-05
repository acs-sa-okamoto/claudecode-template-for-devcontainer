// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import type { ProjectGroup, SyncJob } from "../../shared/index.js"
import { renderProjectGroup } from "./projectGroup.js"
import { BULK_BUTTON_TESTID, createBulkSyncEnhancer } from "./bulkSync.js"

function makeGroup(over: Partial<ProjectGroup> = {}): ProjectGroup {
  return { project: "p", notionLinked: false, tasks: [], ...over }
}

function makeJob(over: Partial<SyncJob> = {}): SyncJob {
  return {
    jobId: "job_1",
    project: "p",
    total: 3,
    done: 0,
    failed: 0,
    status: "running",
    etaSeconds: null,
    startedAt: "t",
    ...over,
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe("createBulkSyncEnhancer (header enhancer + polling)", () => {
  it("TC-03: プロジェクト見出し横に一括登録ボタンを表示する", () => {
    // 【テスト目的】一括登録ボタンの配置（REQ-005）
    const enhancer = createBulkSyncEnhancer({
      startBulkSync: vi.fn(),
      getJob: vi.fn(),
    })
    const section = renderProjectGroup(makeGroup(), { headerEnhancer: enhancer })
    expect(section.querySelector(`[data-testid="${BULK_BUTTON_TESTID}"]`)).not.toBeNull()
  })

  it("change 1: 閲覧専用モードでは一括登録ボタンが非活性で配線されない", () => {
    // 【テスト目的】view モードは Notion 連携不可のため一括登録不可
    const startBulkSync = vi.fn()
    const enhancer = createBulkSyncEnhancer({
      startBulkSync,
      getJob: vi.fn(),
      viewMode: true,
    })
    const section = renderProjectGroup(makeGroup(), { headerEnhancer: enhancer })
    const btn = section.querySelector<HTMLButtonElement>(`[data-testid="${BULK_BUTTON_TESTID}"]`)
    expect(btn?.disabled).toBe(true)
    btn?.click()
    expect(startBulkSync).not.toHaveBeenCalled()
  })

  it("TC-INT-01: 一括登録→ポーリングで進捗更新→完了で進捗バー消去", async () => {
    // 【テスト目的】一括登録の進捗バーが完了まで更新され消える（REQ-011/204 / AC-10）
    // 【テスト内容】running(0/3)→running(2/3)→completed をポーリングで返す
    // 【期待される動作】進捗バーが更新され、完了で消える。ボタンは押下後も存在（UI 非ブロック）
    const startBulkSync = vi.fn(async () => makeJob({ done: 0, total: 3 }))
    const jobStates: SyncJob[] = [
      makeJob({ done: 2, total: 3, status: "running" }),
      makeJob({ done: 3, total: 3, status: "completed" }),
    ]
    const completed = makeJob({ done: 3, total: 3, status: "completed" })
    let call = 0
    const getJob = vi.fn(async (): Promise<SyncJob> => jobStates[call++] ?? completed)

    // setTimeout を即時実行に差し替え、ポーリングを実時間非依存にする。
    const timers: Array<() => void> = []
    const setTimeoutFn = ((fn: () => void) => {
      timers.push(fn)
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout

    const enhancer = createBulkSyncEnhancer({ startBulkSync, getJob, setTimeoutFn })
    const section = renderProjectGroup(makeGroup({ project: "p" }), {
      headerEnhancer: enhancer,
    })
    const btn = section.querySelector<HTMLButtonElement>(`[data-testid="${BULK_BUTTON_TESTID}"]`)

    btn?.click()
    await flush()
    expect(startBulkSync).toHaveBeenCalledWith("p")
    // 初回ポーリングの待機が予約されているはず。
    expect(timers.length).toBeGreaterThan(0)

    // 1 回目のポーリング（running 2/3）。
    timers.shift()?.()
    await flush()
    const bar = section.querySelector('[data-testid="sync-progress"]')
    expect(bar?.textContent).toContain("2 / 3件")
    // UI 非ブロック: ボタンは依然存在する（全面ブロックしない）。
    expect(section.querySelector(`[data-testid="${BULK_BUTTON_TESTID}"]`)).not.toBeNull()

    // 2 回目のポーリング（completed）。
    timers.shift()?.()
    await flush()
    expect(section.querySelector('[data-testid="sync-progress"]')).toBeNull()
  })
})
