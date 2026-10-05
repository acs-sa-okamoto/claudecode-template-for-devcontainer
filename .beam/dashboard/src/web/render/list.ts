// 一覧全体の描画。ProjectGroup[] を受け取りコンテナへまとめて描画する。
//
// 1000 件を 5 秒以内に描画する（NFR-001）ため、DocumentFragment で一括挿入し
// 行ごとの reflow を避ける。

import type { ProjectGroup } from "../../shared/index.js"
import { clear, el } from "../dom.js"
import { renderProjectGroup, type GroupRenderOptions } from "./projectGroup.js"

/** 空一覧時に表示する日本語メッセージ（NFR-201）。 */
export const EMPTY_MESSAGE = "表示できるタスクがありません。"

/**
 * 一覧コンテナへ ProjectGroup[] を描画する。
 * 既存内容をクリアし、DocumentFragment 経由で一括挿入する（性能配慮）。
 * 空配列の場合は空状態メッセージを表示する（EDGE-101）。
 * options で行・見出しに操作 UI / エラーを差し込める（TASK-0021/0024）。
 */
export function renderList(
  container: Element,
  groups: ProjectGroup[],
  options: GroupRenderOptions = {},
): void {
  clear(container)
  if (groups.length === 0) {
    container.appendChild(
      el("p", {
        className: "empty-state",
        text: EMPTY_MESSAGE,
        attrs: { "data-testid": "empty-state" },
      }),
    )
    return
  }
  const frag = document.createDocumentFragment()
  for (const group of groups) {
    frag.appendChild(renderProjectGroup(group, options))
  }
  container.appendChild(frag)
}
