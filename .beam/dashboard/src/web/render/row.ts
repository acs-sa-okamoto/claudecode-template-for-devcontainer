// タスク 1 行分の描画。
//
// status / notion_sync_status バッジ（TASK-0020）、取り消し線・ハイライト、
// 操作ボタン（TASK-0021）、エラー表示（TASK-0024）を組み立てる。
//
// XSS 防止（P0）: title/content など外部・ソース DB 由来文字列は dom.el の text
// （textContent）で挿入する。innerHTML への生連結はしない。バッジラベルは固定マップ。

import type { TaskView } from "../../shared/index.js"
import { el } from "../dom.js"
import { renderStatusBadge, renderSyncBadge } from "./badge.js"

/** 取り消し線クラス（pending_deletion / isDeleted）。 */
export const ROW_DELETED_CLASS = "row--deleted"
/** ハイライトクラス（updateBadge / SSE 更新）。 */
export const ROW_UPDATED_CLASS = "row--updated"

/** 行の操作ボタン・エラーなどを差し込むための拡張フック（TASK-0021/0024 が利用）。 */
export type RowEnhancer = (row: HTMLTableRowElement, task: TaskView) => void

/**
 * タスク 1 件を表の行（<tr>）として生成する。
 * 列順（REQ-002）: task_id / title / content / created_at / updated_at /
 * status / notion_sync_status / is_deleted / update_badge / 操作。
 * - data-project / data-task-id を持ち、SSE・操作 UI から特定できる。
 * - status / notion_sync_status はバッジ、取り消し線・ハイライトは行クラスで反映する。
 * - enhancer（任意）は操作セル（.row-actions）へボタン等を差し込む（責務分離）。
 */
export function renderRow(
  task: TaskView,
  enhancer?: RowEnhancer,
): HTMLTableRowElement {
  // title は span.row-title に包み、取り消し線スタイル（.row--deleted .row-title）の対象にする。
  const titleCell = el("td", {
    className: "col-title",
    children: [
      el("span", {
        className: "row-title",
        text: task.title,
        attrs: { "data-testid": "row-title" },
      }),
    ],
  })

  // 操作セル: 個別登録/削除同期ボタンや同期エラーをここへ差し込む（enhancer が利用）。
  const actionsCell = el("td", {
    className: "row-actions",
    attrs: { "data-testid": "row-actions" },
  })

  const row = el("tr", {
    className: "task-row",
    dataset: { project: task.project, taskId: String(task.taskId) },
    attrs: { "data-testid": "task-row" },
    children: [
      el("td", {
        className: "col-task-id",
        text: String(task.taskId),
        attrs: { "data-testid": "row-task-id" },
      }),
      titleCell,
      el("td", {
        className: "col-content",
        text: task.content,
        attrs: { "data-testid": "row-content" },
      }),
      el("td", { className: "col-created", text: task.createdAt }),
      el("td", { className: "col-updated", text: task.updatedAt }),
      el("td", {
        className: "col-status",
        children: [renderStatusBadge(task.status)],
      }),
      el("td", {
        className: "col-sync",
        children: [renderSyncBadge(task.notionSyncStatus)],
      }),
      el("td", {
        className: "col-is-deleted",
        text: task.isDeleted ? "✓" : "—",
      }),
      el("td", {
        className: "col-update-badge",
        text: task.updateBadge ? "あり" : "なし",
      }),
      actionsCell,
    ],
  })

  // 取り消し線: pending_deletion または isDeleted（REQ-105 / AC-13）。
  if (task.isDeleted || task.notionSyncStatus === "pending_deletion") {
    row.classList.add(ROW_DELETED_CLASS)
  }
  // ハイライト: updateBadge（REQ-010 / AC-12）。取り消し線と併用可。
  if (task.updateBadge) {
    row.classList.add(ROW_UPDATED_CLASS)
  }

  if (enhancer) enhancer(row, task)
  return row
}

/** コンテナ内から project/taskId に一致する行を探す（SSE ハイライト等で利用）。 */
export function findRow(
  container: ParentNode,
  project: string,
  taskId: string,
): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    `.task-row[data-project="${cssEscape(project)}"][data-task-id="${taskId}"]`,
  )
}

/** 指定行へハイライトクラスを付与する（存在すれば）。 */
export function markRowUpdated(
  container: ParentNode,
  project: string,
  taskId: string,
): void {
  findRow(container, project, taskId)?.classList.add(ROW_UPDATED_CLASS)
}

/**
 * CSS 属性セレクタに安全に埋め込むためのエスケープ。
 * project はソース DB 由来のテーブル名（識別子）で英数とアンダースコア中心だが、
 * 念のため引用符・バックスラッシュをエスケープしてセレクタインジェクションを防ぐ。
 */
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&")
}
