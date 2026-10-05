// Notifier（TASK-0013）: 集約ウィンドウとトースト発火の結線。
//
// 設計契約: requirements.md（REQ-008/009/101/102, EDGE-201）/ dataflow.md（Notifier）。
//
// hook 受信ごとに onEvent() を呼ぶ。AggregationWindowManager が 5 秒集約ウィンドウを管理し、
// 満了時にこの Notifier の flush ハンドラを呼ぶ。flush 時点で通知 ON/OFF を参照し、
// ON のときのみ fireToast(count) を実行する（OFF なら発火しない＝EDGE-201。一覧更新は別経路）。
//
// 設計判断: ON/OFF 判定は「満了時点」に行う。これにより、ウィンドウ稼働中に OFF へ切り替えられた
// 場合も満了時の発火を停止できる（EDGE-201）。通知設定の取得は MetaStore.getNotificationsEnabled
// 互換の isEnabled 関数として注入する（DB 依存をテストから切り離す）。
//
// セキュリティ（P0/NFR-104）: 件数のみを扱い、トースト本文・ログに機密情報・個人情報を含めない。

import type { AppLogger } from "../../logger/index.js"
import { logger as sharedLogger } from "../../logger/index.js"
import { AggregationWindowManager, type TimerDeps } from "./aggregation-window.js"
import { fireToast as realFireToast } from "./toast.js"

/** Notifier の依存（注入）。 */
export interface NotifierDeps {
  /** 通知 ON/OFF を返す（既定: 常時 true ではなく、呼び出し側が必ず注入する想定）。 */
  isEnabled: () => boolean
  /** トースト発火（既定 toast.fireToast）。テストでフェイク化。 */
  fireToast?: (count: number) => void
  /** クロック・タイマー（既定 実時間）。テストでフェイク化。 */
  timer?: Partial<TimerDeps>
  /** ロガー（既定 共有 logger）。 */
  logger?: AppLogger
}

/**
 * 5 秒集約ウィンドウ → トースト発火を司る Notifier。
 */
export class Notifier {
  private readonly windowManager: AggregationWindowManager
  private readonly isEnabled: () => boolean
  private readonly fire: (count: number) => void
  private readonly log: AppLogger

  constructor(deps: NotifierDeps) {
    this.isEnabled = deps.isEnabled
    this.fire = deps.fireToast ?? realFireToast
    this.log = deps.logger ?? sharedLogger
    this.windowManager = new AggregationWindowManager(
      (count) => this.onFlush(count),
      deps.timer ?? {},
    )
  }

  /** hook 受信イベントを 1 件投入する（集約ウィンドウへ加算）。 */
  onEvent(): void {
    this.windowManager.add()
  }

  /**
   * ウィンドウ満了時のハンドラ。満了時点の通知設定を参照し、ON のときのみ発火する。
   * 件数 0 は理論上発生しない（add で必ず 1 以上）が、念のため発火しない。
   */
  private onFlush(count: number): void {
    if (count <= 0) return
    // 満了時点の ON/OFF を参照（稼働中の OFF 切替を反映 EDGE-201）。
    if (!this.isEnabled()) return
    this.fire(count)
    this.log.logNotification(count)
  }
}
