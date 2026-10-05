// status / notion_sync_status のバッジ描画。
//
// ラベルは日本語固定マップ（NFR-201）。色（CSS クラス）とテキスト両方で状態を区別
// する（NFR-202）。ラベルは固定リテラルのため XSS の懸念はないが、生成はすべて
// dom.el（textContent）経由で行い innerHTML 連結を避ける（P0）。

import type { NotionSyncStatus, TaskStatus } from "../../shared/index.js"
import { el } from "../dom.js"

/** タスク status の日本語ラベル（REQ-403 / 4値）。 */
export const STATUS_LABEL: Record<TaskStatus, string> = {
  ready: "未着手",
  in_progress: "進行中",
  in_review: "レビュー中",
  done: "完了",
}

/** Notion 連携 status の日本語ラベル（REQ-404 / 5値）。 */
export const SYNC_LABEL: Record<NotionSyncStatus, string> = {
  not_synced: "未登録",
  syncing: "登録中",
  synced: "登録済",
  pending_deletion: "削除待ち",
  sync_failed: "失敗",
}

/** 未知の値が来た場合のフォールバックラベル（描画を壊さない）。 */
const FALLBACK_LABEL = "不明"

/** status バッジ要素を生成する。未知値はフォールバック表示。 */
export function renderStatusBadge(status: TaskStatus | string): HTMLElement {
  const label = STATUS_LABEL[status as TaskStatus] ?? FALLBACK_LABEL
  return el("span", {
    className: `badge badge--status-${status}`,
    text: label,
    attrs: { "data-testid": "status-badge", "data-status": String(status) },
  })
}

/** notion_sync_status バッジ要素を生成する。未知値はフォールバック表示。 */
export function renderSyncBadge(
  status: NotionSyncStatus | string,
): HTMLElement {
  const label = SYNC_LABEL[status as NotionSyncStatus] ?? FALLBACK_LABEL
  return el("span", {
    className: `badge badge--sync-${status}`,
    text: label,
    attrs: { "data-testid": "sync-badge", "data-sync-status": String(status) },
  })
}
