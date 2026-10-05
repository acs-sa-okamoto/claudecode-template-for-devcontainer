// 一括登録の進捗バー描画（REQ-011 / AC-10）。
//
// 「X / N件 登録中... 残り推定: M分」と進捗バーを表示し、完了で消去する。
//
// XSS（P0）: 文言は固定日本語テンプレート、件数・分は number を文字列化して
// dom.el の text（textContent）で挿入する。innerHTML 生連結はしない。

import type { SyncJob } from "../../shared/index.js"
import { clear, el } from "../dom.js"

/** 進捗バー要素を識別する data-testid。 */
export const PROGRESS_TESTID = "sync-progress"

/** etaSeconds（秒）から「残り推定: M分」表記を作る。null/0 は空文字。 */
function etaLabel(etaSeconds: number | null): string {
  if (etaSeconds === null || etaSeconds <= 0) return ""
  // 体感に合わせて分へ切り上げ（AC-10 は推定値の概算表示）。
  const minutes = Math.ceil(etaSeconds / 60)
  return ` 残り推定: ${minutes}分`
}

/** ジョブから進捗テキストを組み立てる。 */
function progressText(job: SyncJob): string {
  return `${job.done} / ${job.total}件 登録中...${etaLabel(job.etaSeconds)}`
}

/**
 * 進捗バーを生成してコンテナへ追加する（既存があれば置き換える）。
 * role="progressbar" + aria-* でアクセシブルにする。
 */
export function renderProgress(container: Element, job: SyncJob): HTMLElement {
  clearProgress(container)
  const bar = el("div", {
    className: "sync-progress",
    text: progressText(job),
    attrs: {
      "data-testid": PROGRESS_TESTID,
      role: "progressbar",
      "aria-valuenow": String(job.done),
      "aria-valuemin": "0",
      "aria-valuemax": String(job.total),
    },
  })
  container.appendChild(bar)
  return bar
}

/**
 * 既存の進捗バーがあれば中身と aria を更新する（無ければ新規生成）。
 * ポーリングのたびに呼ぶ。
 */
export function updateProgress(container: Element, job: SyncJob): HTMLElement {
  const bar = container.querySelector<HTMLElement>(
    `[data-testid="${PROGRESS_TESTID}"]`,
  )
  if (!bar) return renderProgress(container, job)
  // textContent で安全に上書き（XSS 防止）。
  clear(bar)
  bar.textContent = progressText(job)
  bar.setAttribute("aria-valuenow", String(job.done))
  bar.setAttribute("aria-valuemax", String(job.total))
  return bar
}

/** 進捗バーを消去する（ジョブ完了/タイムアウト/失敗時）。 */
export function clearProgress(container: Element): void {
  container
    .querySelectorAll(`[data-testid="${PROGRESS_TESTID}"]`)
    .forEach((node) => node.remove())
}
