// プロジェクト単位のグループ描画。見出し（h2）＋タスク行リストを生成する。

import type { ProjectGroup, TaskView } from "../../shared/index.js"
import { el } from "../dom.js"
import { renderRow, type RowEnhancer } from "./row.js"

/** グループ描画時のフック（行拡張・見出し横ボタン等）。 */
export interface GroupRenderOptions {
  /** 各行へ操作ボタン・エラー等を差し込む（TASK-0021/0024）。 */
  rowEnhancer?: RowEnhancer
  /** プロジェクト見出しの操作領域を拡張する（一括登録ボタン等・TASK-0021）。 */
  headerEnhancer?: (header: HTMLElement, group: ProjectGroup) => void
}

/**
 * tasks を taskId 昇順に並べた新しい配列を返す（非破壊・REQ-003）。
 */
export function sortByTaskId(tasks: TaskView[]): TaskView[] {
  // task_id は "TASK-0001" 等のゼロ埋め文字列。辞書順ソートで昇順になる（REQ-003）。
  return [...tasks].sort((a, b) =>
    a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0,
  )
}

/** タスク表の列見出し（REQ-002 の列順 + 操作列。日本語・NFR-201）。 */
const COLUMN_HEADERS = [
  "タスクID",
  "タイトル",
  "内容",
  "作成日時",
  "更新日時",
  "ステータス",
  "Notion連携",
  "削除",
  "更新",
  "操作",
] as const

/**
 * 1 プロジェクトのセクションを生成する。
 * - 見出しはセマンティックな h2（プロジェクト名は textContent で安全に挿入）。
 * - タスクは <table>（thead 列見出し + tbody 行）で表示する（REQ-002 の列順）。
 * - 行は taskId 昇順（REQ-003）で DocumentFragment にまとめて挿入する。
 */
export function renderProjectGroup(
  group: ProjectGroup,
  options: GroupRenderOptions = {},
): HTMLElement {
  const heading = el("h2", {
    className: "project-heading",
    text: group.project,
    attrs: { "data-testid": "project-heading" },
  })

  const header = el("div", {
    className: "project-header",
    children: [heading],
  })
  options.headerEnhancer?.(header, group)

  // ヘッダ行（列見出し）。
  const headRow = el("tr", {
    children: COLUMN_HEADERS.map((label) =>
      el("th", { text: label, attrs: { scope: "col" } }),
    ),
  })
  const thead = el("thead", { children: [headRow] })

  // 本体行（taskId 昇順）。性能のため DocumentFragment で一括挿入する（NFR-001）。
  const rowsFrag = document.createDocumentFragment()
  for (const task of sortByTaskId(group.tasks)) {
    rowsFrag.appendChild(renderRow(task, options.rowEnhancer))
  }
  const tbody = el("tbody")
  tbody.appendChild(rowsFrag)

  const table = el("table", {
    className: "task-table",
    children: [thead, tbody],
  })

  const section = el("section", {
    className: "project-group",
    dataset: { project: group.project },
    children: [header, table],
  })
  return section
}
