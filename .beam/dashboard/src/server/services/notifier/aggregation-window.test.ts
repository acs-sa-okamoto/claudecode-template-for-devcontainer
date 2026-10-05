// TASK-0013: 集約ウィンドウ AggregationWindowManager の単体テスト。
//
// 実時間・実タイマーに依存せず、注入したフェイククロック / フェイクスケジューラで
// 半開区間 [T0, T0+5000) の挙動（集約・境界繰り越し・複数ウィンドウ）を検証する。

import { describe, expect, it, vi } from "vitest"
import { AggregationWindowManager } from "./aggregation-window.js"

/** 任意時刻を返すフェイククロックと、手動発火できるタイマーを提供するハーネス。 */
function makeHarness(initialNow = 1000) {
  let current = initialNow
  // 登録された満了コールバックと発火予定時刻（fireAt）を保持する。
  const timers: Array<{ id: number; fireAt: number; cb: () => void }> = []
  let nextId = 1
  const deps = {
    now: () => current,
    setTimer: (cb: () => void, ms: number) => {
      const id = nextId++
      timers.push({ id, fireAt: current + ms, cb })
      return id
    },
    clearTimer: (id: number) => {
      const i = timers.findIndex((t) => t.id === id)
      if (i >= 0) timers.splice(i, 1)
    },
  }
  return {
    deps,
    /** 時刻を進める（タイマー発火はしない。明示的に fire で発火させる）。 */
    advance: (ms: number) => {
      current += ms
    },
    setNow: (t: number) => {
      current = t
    },
    /** 予定時刻に達したタイマーを発火する（満了をシミュレート）。 */
    fireDue: () => {
      const due = timers.filter((t) => t.fireAt <= current)
      for (const t of due) {
        const i = timers.findIndex((x) => x.id === t.id)
        if (i >= 0) timers.splice(i, 1)
        t.cb()
      }
    },
  }
}

describe("AggregationWindowManager", () => {
  it("AW-01: 5 秒以内の 3 イベントを 1 ウィンドウに集約し count=3 で 1 回 flush", () => {
    // 【テスト目的】半開区間内の複数イベントが 1 件に集約されること（EDGE-203）。
    // 【テスト内容】T0=1000 で 3 件投入、T0+5000 でタイマー満了。
    // 【期待される動作】flush が 1 回・count=3。
    const h = makeHarness(1000)
    const flush = vi.fn()
    const mgr = new AggregationWindowManager(flush, h.deps)

    mgr.add() // t=1000 (T0)
    h.advance(1000)
    mgr.add() // t=2000
    h.advance(1000)
    mgr.add() // t=3000
    h.setNow(6000) // T0+5000
    h.fireDue()

    expect(flush).toHaveBeenCalledTimes(1)
    expect(flush).toHaveBeenCalledWith(3)
  })

  it("AW-02: T0+5000ms ちょうどのイベントは次ウィンドウへ繰り越す（半開区間）", () => {
    // 【テスト目的】境界イベントを二重計上しないこと（EDGE-102）。
    // 【テスト内容】T0=1000 で 1 件、t=6000(=T0+5000) で 1 件投入し満了させる。
    // 【期待される動作】1 回目 flush は count=1。境界イベントは次ウィンドウに属す。
    const h = makeHarness(1000)
    const flush = vi.fn()
    const mgr = new AggregationWindowManager(flush, h.deps)

    mgr.add() // t=1000 (T0)
    h.setNow(6000) // ちょうど T0+5000（半開区間外）
    mgr.add() // 境界イベント → 次ウィンドウへ
    h.fireDue() // 最初のウィンドウ満了

    expect(flush).toHaveBeenNthCalledWith(1, 1)

    // 次ウィンドウ（T0'=6000）を満了させると count=1。
    h.setNow(11000)
    h.fireDue()
    expect(flush).toHaveBeenNthCalledWith(2, 1)
  })

  it("AW-03: 満了後の新イベントは新ウィンドウとして独立に集約", () => {
    // 【テスト目的】複数ウィンドウが独立して動作すること（REQ-008）。
    const h = makeHarness(1000)
    const flush = vi.fn()
    const mgr = new AggregationWindowManager(flush, h.deps)

    mgr.add() // window1 T0=1000
    h.setNow(6000)
    h.fireDue() // window1 満了 count=1

    mgr.add() // window2 T0'=6000
    mgr.add()
    h.setNow(11000)
    h.fireDue() // window2 満了 count=2

    expect(flush).toHaveBeenNthCalledWith(1, 1)
    expect(flush).toHaveBeenNthCalledWith(2, 2)
  })

  it("AW-04: 単発イベントは count=1 で flush", () => {
    // 【テスト目的】1 件のみでも満了時に flush(1) されること。
    const h = makeHarness(1000)
    const flush = vi.fn()
    const mgr = new AggregationWindowManager(flush, h.deps)

    mgr.add()
    h.setNow(6000)
    h.fireDue()

    expect(flush).toHaveBeenCalledExactlyOnceWith(1)
  })
})
