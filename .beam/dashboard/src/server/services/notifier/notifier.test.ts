// TASK-0013: Notifier の結線テスト。
//
// 集約ウィンドウ満了時に通知 ON/OFF を判定してトーストを発火する経路を検証する。
// クロック・タイマー・fireToast・getNotificationsEnabled をすべて注入する。

import { describe, expect, it, vi } from "vitest"
import { Notifier } from "./notifier.js"

function makeHarness(initialNow = 1000) {
  let current = initialNow
  const timers: Array<{ id: number; fireAt: number; cb: () => void }> = []
  let nextId = 1
  return {
    timerDeps: {
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
    },
    setNow: (t: number) => {
      current = t
    },
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

describe("Notifier", () => {
  it("NT-01: 通知 ON で満了時に fireToast(count) と logNotification を実行", () => {
    // 【テスト目的】ON のとき集約件数でトーストが 1 回発火すること（REQ-101）。
    const h = makeHarness(1000)
    const fireToast = vi.fn()
    const logNotification = vi.fn()
    const notifier = new Notifier({
      isEnabled: () => true,
      fireToast,
      timer: h.timerDeps,
      logger: { logNotification } as never,
    })

    notifier.onEvent()
    notifier.onEvent()
    h.setNow(6000)
    h.fireDue()

    expect(fireToast).toHaveBeenCalledExactlyOnceWith(2)
    expect(logNotification).toHaveBeenCalledWith(2)
  })

  it("NT-02: 通知 OFF では満了時に fireToast を呼ばない", () => {
    // 【テスト目的】OFF のときトースト非発火（一覧更新は別経路で継続）（REQ-102）。
    const h = makeHarness(1000)
    const fireToast = vi.fn()
    const notifier = new Notifier({
      isEnabled: () => false,
      fireToast,
      timer: h.timerDeps,
      logger: { logNotification: vi.fn() } as never,
    })

    notifier.onEvent()
    h.setNow(6000)
    h.fireDue()

    expect(fireToast).not.toHaveBeenCalled()
  })

  it("NT-03: ウィンドウ稼働中に ON→OFF へ切替で満了時の発火を停止（EDGE-201）", () => {
    // 【テスト目的】満了「時点」の設定で判定し、稼働中の OFF 切替を反映すること。
    const h = makeHarness(1000)
    const fireToast = vi.fn()
    let enabled = true
    const notifier = new Notifier({
      isEnabled: () => enabled,
      fireToast,
      timer: h.timerDeps,
      logger: { logNotification: vi.fn() } as never,
    })

    notifier.onEvent() // ON でウィンドウ起動
    enabled = false // 稼働中に OFF へ
    h.setNow(6000)
    h.fireDue()

    expect(fireToast).not.toHaveBeenCalled()
  })

  it("NT-04: 通知 ON で 5 秒以内の複数イベントを 1 件のトーストに集約", () => {
    // 【テスト目的】集約ウィンドウとトースト発火の一貫性（EDGE-203）。
    const h = makeHarness(1000)
    const fireToast = vi.fn()
    const notifier = new Notifier({
      isEnabled: () => true,
      fireToast,
      timer: h.timerDeps,
      logger: { logNotification: vi.fn() } as never,
    })

    notifier.onEvent()
    h.setNow(2000)
    notifier.onEvent()
    h.setNow(4000)
    notifier.onEvent()
    h.setNow(6000)
    h.fireDue()

    expect(fireToast).toHaveBeenCalledExactlyOnceWith(3)
  })
})
