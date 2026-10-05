// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import type { SyncJob } from "../../shared/index.js"
import { clearProgress, renderProgress, updateProgress } from "./progress.js"

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

describe("render/progress", () => {
  it("TC-10: 進捗バーが「done / total件 登録中...」と role=progressbar を持つ", () => {
    // 【テスト目的】進捗バーの表示と ARIA（REQ-011 / AC-10）
    // 【テスト内容】done=2/total=3 のジョブで描画
    // 【期待される動作】文言に「2 / 3件 登録中...」、role=progressbar
    const container = document.createElement("div")
    renderProgress(container, makeJob({ done: 2, total: 3 }))
    const bar = container.querySelector('[data-testid="sync-progress"]')
    expect(bar?.getAttribute("role")).toBe("progressbar")
    expect(bar?.textContent).toContain("2 / 3件 登録中...")
    expect(bar?.getAttribute("aria-valuenow")).toBe("2")
    expect(bar?.getAttribute("aria-valuemax")).toBe("3")
  })

  it("TC-11: etaSeconds から「残り推定: M分」を付与する（切り上げ）", () => {
    // 【テスト目的】ETA の分換算（切り上げ・AC-10）
    // 【テスト内容】etaSeconds=72（=1.2分）→ 2分
    const container = document.createElement("div")
    renderProgress(container, makeJob({ done: 1, total: 3, etaSeconds: 72 }))
    const bar = container.querySelector('[data-testid="sync-progress"]')
    expect(bar?.textContent).toContain("残り推定: 2分")
  })

  it("TC-B01: etaSeconds=null のとき「残り推定」を表示しない", () => {
    // 【テスト目的】ETA 不明時の表示抑制
    const container = document.createElement("div")
    renderProgress(container, makeJob({ etaSeconds: null }))
    const bar = container.querySelector('[data-testid="sync-progress"]')
    expect(bar?.textContent).not.toContain("残り推定")
  })

  it("updateProgress が既存バーの表示を更新する", () => {
    // 【テスト目的】ポーリングでの再描画（同一バーを更新）
    const container = document.createElement("div")
    renderProgress(container, makeJob({ done: 0, total: 3 }))
    updateProgress(container, makeJob({ done: 2, total: 3 }))
    const bars = container.querySelectorAll('[data-testid="sync-progress"]')
    expect(bars.length).toBe(1)
    expect(bars[0]?.textContent).toContain("2 / 3件")
  })

  it("TC-12: clearProgress で進捗バーを消去する", () => {
    // 【テスト目的】完了時に進捗バーを除去（REQ-011）
    const container = document.createElement("div")
    renderProgress(container, makeJob())
    clearProgress(container)
    expect(container.querySelector('[data-testid="sync-progress"]')).toBeNull()
  })

  it("TC-B02: total=0 でも破綻しない", () => {
    // 【テスト目的】境界（対象 0 件）
    const container = document.createElement("div")
    renderProgress(container, makeJob({ done: 0, total: 0 }))
    const bar = container.querySelector('[data-testid="sync-progress"]')
    expect(bar?.textContent).toContain("0 / 0件")
  })
})
