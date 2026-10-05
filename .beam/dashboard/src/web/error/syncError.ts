// 同期失敗（sync_failed）の行エラー表示（REQ-109 / NFR-302 / AC-11）。
//
// notion_sync_status === "sync_failed" のタスク行へ日本語エラーメッセージを付与する。
// 失敗時のエラー表示率は 100%（描画時に必ず付与）。
//
// XSS（P0）: 固定日本語テンプレートを textContent で挿入する。

import type { TaskView } from "../../shared/index.js"
import { el } from "../dom.js"

/** Notion 連携失敗時の固定メッセージ（NFR-201）。 */
export const SYNC_FAILED_MESSAGE = "Notionへの登録に失敗しました。"

/** 行エラー要素を生成する（role="alert"）。 */
export function createRowError(
  message: string = SYNC_FAILED_MESSAGE,
): HTMLElement {
  return el("span", {
    className: "row-error",
    text: message,
    attrs: { role: "alert", "data-testid": "row-error" },
  })
}

/**
 * sync_failed の行へエラーメッセージを付与する（重複付与はしない）。
 * 行 enhancer（renderRow の第 2 引数）から呼ぶ想定。
 */
export function applySyncError(row: HTMLElement, task: TaskView): void {
  if (task.notionSyncStatus !== "sync_failed") return
  if (row.querySelector('[data-testid="row-error"]')) return
  // 操作セル（td.row-actions）があればその中へ、無ければ行へ直接付与する。
  const target = row.querySelector<HTMLElement>(".row-actions") ?? row
  target.appendChild(createRowError())
}
