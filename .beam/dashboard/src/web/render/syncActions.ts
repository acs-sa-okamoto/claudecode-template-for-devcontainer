// 行の同期操作ボタン（個別登録 / 削除同期）を差し込む RowEnhancer（TASK-0021）。
//
// - 個別登録ボタン: notion_sync_status が "not_synced" または "sync_failed"（再試行・
//   REQ-203）のとき活性。押下で syncOne を呼ぶ。処理中は disabled で二重送信を防ぐ。
// - 削除同期ボタン: notion_sync_status === "pending_deletion" の行にのみ表示（REQ-106）。
// - 閲覧専用モード（viewMode）: Notion 連携不可のため、登録/削除同期ボタンを無条件で非活性にする。
//
// XSS（P0）: ボタンラベル・aria-label は固定日本語。値は dom.el の textContent。
// API は注入（テストでフェイク化、実 fetch 非依存）。

import type { SyncResult, TaskView } from "../../shared/index.js"
import { ApiError } from "../api/client.js"
import { el } from "../dom.js"
import type { RowEnhancer } from "./row.js"

/** 個別登録ボタンの data-testid。 */
export const SYNC_BUTTON_TESTID = "sync-button"
/** 削除同期ボタンの data-testid。 */
export const DELETE_BUTTON_TESTID = "delete-sync-button"

/** 同期操作の依存（テスト・本番で注入）。 */
export interface SyncActionsDeps {
  /** タスク 1 件を Notion に登録する。 */
  syncOne: (project: string, taskId: string) => Promise<SyncResult>
  /** pending_deletion の削除を Notion に反映する。 */
  syncDelete: (project: string, taskId: string) => Promise<SyncResult>
  /** API 失敗時の通知（呼び出し側がエラー表示・任意）。 */
  onError?: (error: ApiError) => void
  /** 操作完了後の再描画（任意。一覧再取得など）。 */
  onChange?: () => void
  /** 閲覧専用モードか。true のとき登録/削除同期ボタンを無条件で非活性にする（change 1）。 */
  viewMode?: boolean
}

/**
 * クリック処理の共通ラッパ。処理中はボタンを無効化し、完了後に戻す
 * （二重送信防止）。失敗時は ApiError を onError へ委譲する。
 */
function bindAction(
  button: HTMLButtonElement,
  action: () => Promise<unknown>,
  deps: SyncActionsDeps,
): void {
  button.addEventListener("click", () => {
    button.disabled = true
    void action()
      .then(() => deps.onChange?.())
      .catch((error: unknown) => {
        if (error instanceof ApiError && deps.onError) deps.onError(error)
      })
      .finally(() => {
        button.disabled = false
      })
  })
}

/** 個別登録ボタンを生成する。未同期/失敗、または synced かつ更新ありのとき活性。 */
function createSyncButton(task: TaskView, deps: SyncActionsDeps): HTMLButtonElement {
  // synced かつ更新あり（再同期）は文言を変えて「更新の反映」であることを示す。
  const isResync =
    task.notionSyncStatus === "synced" && task.updateBadge === true
  const button = el("button", {
    className: "sync-button",
    text: isResync ? "更新をNotionに反映" : "Notionに登録",
    attrs: {
      type: "button",
      "data-testid": SYNC_BUTTON_TESTID,
      "aria-label": isResync
        ? "このタスクの更新を Notion に反映"
        : "このタスクを Notion に登録",
    },
  })
  // not_synced / sync_failed（再試行・REQ-203）に加え、synced かつ更新あり（再同期）も活性。
  // 閲覧専用モードは無条件で非活性。
  const registrable =
    task.notionSyncStatus === "not_synced" ||
    task.notionSyncStatus === "sync_failed" ||
    isResync
  button.disabled = deps.viewMode === true || !registrable
  bindAction(button, () => deps.syncOne(task.project, task.taskId), deps)
  return button
}

/** 削除同期ボタンを生成する（pending_deletion 行専用）。 */
function createDeleteButton(task: TaskView, deps: SyncActionsDeps): HTMLButtonElement {
  const button = el("button", {
    className: "delete-sync-button",
    text: "削除をNotionに反映",
    attrs: {
      type: "button",
      "data-testid": DELETE_BUTTON_TESTID,
      "aria-label": "このタスクの削除を Notion に反映",
    },
  })
  // 閲覧専用モードは Notion 連携不可のため無条件で非活性（change 1）。
  button.disabled = deps.viewMode === true
  bindAction(button, () => deps.syncDelete(task.project, task.taskId), deps)
  return button
}

/**
 * 同期操作ボタンを行へ差し込む RowEnhancer を返す。
 * renderRow(task, enhancer) / GroupRenderOptions.rowEnhancer から使う。
 */
export function createSyncActions(deps: SyncActionsDeps): RowEnhancer {
  return (row, task) => {
    // 操作セル（renderRow が用意した td.row-actions）へボタンを差し込む。
    // 後方互換: セルが無ければ行へ直接追加する。
    const actions = row.querySelector<HTMLElement>(".row-actions") ?? row
    if (task.notionSyncStatus === "pending_deletion") {
      // 削除待ちは削除同期のみ提供（登録対象ではない）。
      actions.appendChild(createDeleteButton(task, deps))
    } else {
      actions.appendChild(createSyncButton(task, deps))
    }
  }
}
