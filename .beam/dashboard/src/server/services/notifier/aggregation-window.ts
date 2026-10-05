// 集約ウィンドウ管理 AggregationWindowManager（TASK-0013）。
//
// 設計契約: requirements.md（REQ-008/NFR-004）/ interfaces.ts（AggregationWindow）/
// dataflow.md（Notifier）。EDGE-102（境界）・EDGE-203（集約）。
//
// 最初のイベント受信時刻 T0 を起点に、半開区間 [T0, T0+5000) に届くイベントを 1 件に集約する。
// 満了時（タイマー発火）に件数 N を確定して flush コールバックに渡し、ウィンドウをクリアする。
// ちょうど T0+5000ms に届いたイベントは半開区間外のため次ウィンドウへ繰り越す（二重計上防止）。
//
// 設計判断: 実時間・実タイマーに依存しないよう、現在時刻取得（now）とタイマー（setTimer/
// clearTimer）を注入可能にする。これにより EDGE-102 の境界をテストで厳密に検証できる。

import type { AggregationWindow } from "../../../shared/index.js"

/** 集約ウィンドウの固定長（5 秒）。NFR-004 で固定動作。 */
export const WINDOW_MS = 5000

/** 注入可能なクロック・タイマー依存。テストでフェイク化する。 */
export interface TimerDeps {
  /** 現在時刻（ミリ秒）。既定 Date.now。 */
  now: () => number
  /** ms 後に cb を呼ぶタイマーを登録し ID を返す。既定 setTimeout。 */
  setTimer: (cb: () => void, ms: number) => number
  /** タイマーを取り消す。既定 clearTimeout。 */
  clearTimer: (id: number) => void
}

/** 既定の実タイマー（本番用）。 */
const realTimerDeps: TimerDeps = {
  now: () => Date.now(),
  setTimer: (cb, ms) => setTimeout(cb, ms) as unknown as number,
  clearTimer: (id) => clearTimeout(id),
}

/**
 * 半開区間 [T0, T0+5000) の集約ウィンドウを管理する。
 * onFlush(count) は満了時に集約件数で 1 回呼ばれる。
 */
export class AggregationWindowManager {
  private window: AggregationWindow | null = null
  private timerId: number | null = null
  private readonly timer: TimerDeps

  constructor(
    private readonly onFlush: (count: number) => void,
    timer: Partial<TimerDeps> = {},
  ) {
    this.timer = { ...realTimerDeps, ...timer }
  }

  /**
   * イベントを 1 件投入する。
   * - ウィンドウ未起動: T0 を確定し count=1、満了タイマーを起動する。
   * - 半開区間内 [T0, T0+5000): 同一ウィンドウで count++。
   * - 半開区間外（境界含む）: 満了処理は別途タイマーが行うため、ここでは通常起こらないが、
   *   タイマー発火前に区間外イベントが来た場合は現ウィンドウを満了させてから新ウィンドウを開く
   *   （境界イベントの繰り越し EDGE-102）。
   */
  add(): void {
    const now = this.timer.now()
    if (this.window === null) {
      this.startWindow(now)
      return
    }
    const elapsed = now - this.window.startedAt
    if (elapsed < WINDOW_MS) {
      // 半開区間内: 集約する。
      this.window.count += 1
      return
    }
    // 半開区間外（境界 T0+5000 含む）: 現ウィンドウを満了させ、新ウィンドウへ繰り越す。
    this.flush()
    this.startWindow(now)
  }

  /** 現在のウィンドウ件数を返す（テスト・診断用）。未起動なら 0。 */
  get currentCount(): number {
    return this.window?.count ?? 0
  }

  /** 新しいウィンドウを T0=now で開始し、満了タイマーを仕掛ける。 */
  private startWindow(now: number): void {
    this.window = { startedAt: now, count: 1 }
    this.timerId = this.timer.setTimer(() => this.flush(), WINDOW_MS)
  }

  /** ウィンドウを満了させ、件数を flush に渡してクリアする。多重呼び出しに安全。 */
  private flush(): void {
    if (this.window === null) return
    const count = this.window.count
    if (this.timerId !== null) {
      this.timer.clearTimer(this.timerId)
      this.timerId = null
    }
    this.window = null
    this.onFlush(count)
  }
}
