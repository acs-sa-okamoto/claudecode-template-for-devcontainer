// プロジェクト見出し横の一括登録ボタン + ジョブ進捗ポーリング（TASK-0021）。
//
// - 見出し横に一括登録ボタンを配置（REQ-005）。押下で startBulkSync → jobId を取得。
// - jobId を一定間隔でポーリング（getJob）し進捗バーを更新（REQ-011 / AC-10）。
//   status が running 以外（completed/timeout/failed）で停止し進捗バーを消去する。
// - ボタンは押下後も DOM に残し、UI を全面ブロックしない（REQ-204）。同一プロジェクトの
//   ジョブが進行中は二重起動を防ぐためボタンを一時無効化する。
//
// XSS（P0）: ボタンラベルは固定日本語。進捗文言は progress.ts（textContent）。
// API・タイマーは注入し、実時間・実 fetch 非依存でテストする。

import type { ProjectGroup, SyncJob } from "../../shared/index.js"
import { ApiError } from "../api/client.js"
import { el } from "../dom.js"
import { clearProgress, updateProgress } from "./progress.js"

/** 一括登録ボタンの data-testid。 */
export const BULK_BUTTON_TESTID = "bulk-sync-button"

/** ポーリング間隔の既定（ms）。過剰リクエストを避けつつ体感を維持（1.5 秒）。 */
export const DEFAULT_POLL_MS = 1500

/** 一括登録の依存（テスト・本番で注入）。 */
export interface BulkSyncDeps {
  /** 一括登録ジョブを開始し SyncJob（jobId）を返す。 */
  startBulkSync: (project: string) => Promise<SyncJob>
  /** ジョブ進捗を取得する。 */
  getJob: (jobId: string) => Promise<SyncJob>
  /** API 失敗時の通知（任意）。 */
  onError?: (error: ApiError) => void
  /** ジョブ完了時の再描画（任意。一覧再取得など）。 */
  onComplete?: () => void
  /** ポーリング間隔（ms・既定 1500）。 */
  pollMs?: number
  /** setTimeout 注入（テストで実時間非依存）。 */
  setTimeoutFn?: typeof setTimeout
  /** 閲覧専用モードか。true のとき一括登録ボタンを無条件で非活性にする（change 1）。 */
  viewMode?: boolean
}

/** ジョブが終端状態（これ以上進捗しない）か。 */
function isTerminal(status: SyncJob["status"]): boolean {
  return status !== "running"
}

/**
 * ヘッダ要素へ一括登録ボタンを差し込む headerEnhancer を返す。
 * GroupRenderOptions.headerEnhancer から使う。
 */
export function createBulkSyncEnhancer(
  deps: BulkSyncDeps,
): (header: HTMLElement, group: ProjectGroup) => void {
  const setTimeoutFn = deps.setTimeoutFn ?? setTimeout
  const pollMs = deps.pollMs ?? DEFAULT_POLL_MS

  return (header, group) => {
    const button = el("button", {
      className: "bulk-sync-button",
      text: "一括登録",
      attrs: {
        type: "button",
        "data-testid": BULK_BUTTON_TESTID,
        "aria-label": `${group.project} の未登録タスクを一括登録`,
      },
    })
    // 進捗バーはヘッダ内に表示する（行操作はブロックしない・REQ-204）。
    const progressArea = el("div", { className: "bulk-progress-area" })
    header.appendChild(button)
    header.appendChild(progressArea)

    // 閲覧専用モード: Notion 連携不可のため無条件で非活性化し、クリック配線もしない（change 1）。
    if (deps.viewMode === true) {
      button.disabled = true
      return
    }

    // jobId を再帰的にポーリングし、進捗バーを更新する。
    const poll = (jobId: string): void => {
      setTimeoutFn(() => {
        void deps
          .getJob(jobId)
          .then((job) => {
            if (isTerminal(job.status)) {
              clearProgress(progressArea)
              button.disabled = false
              deps.onComplete?.()
              return
            }
            updateProgress(progressArea, job)
            poll(jobId)
          })
          .catch((error: unknown) => {
            // ポーリング失敗時は停止し復帰（再試行はユーザー操作に委ねる）。
            clearProgress(progressArea)
            button.disabled = false
            if (error instanceof ApiError && deps.onError) deps.onError(error)
          })
      }, pollMs)
    }

    button.addEventListener("click", () => {
      // 進行中ジョブの二重起動を防ぐ（ボタンのみ無効化・行操作は継続可）。
      button.disabled = true
      void deps
        .startBulkSync(group.project)
        .then((job) => {
          updateProgress(progressArea, job)
          poll(job.jobId)
        })
        .catch((error: unknown) => {
          button.disabled = false
          if (error instanceof ApiError && deps.onError) deps.onError(error)
        })
    })
  }
}
