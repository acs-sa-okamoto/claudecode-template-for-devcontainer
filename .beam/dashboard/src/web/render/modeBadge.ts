// 動作モード表示バッジ。view モード（閲覧専用）のとき画面上部に明示する。

import { el } from "../dom.js"

/** view モード時に表示する「閲覧専用」バッジ要素を生成する。 */
export function createViewModeBadge(): HTMLElement {
  return el("div", {
    className: "mode-badge mode-badge-view",
    text: "👁 閲覧専用モード（Notion 連携なし）",
    attrs: {
      "data-testid": "view-mode-badge",
      role: "status",
      title:
        "ソース DB のタスクを表示するだけのモードです。Notion 連携を使うには .env に NOTION_API_TOKEN / NOTION_PARENT_PAGE_ID を設定してください。",
    },
  })
}
