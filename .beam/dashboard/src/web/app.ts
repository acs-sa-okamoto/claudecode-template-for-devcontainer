// アプリのレイアウト構築と一覧ロード/描画のオーケストレーション。
//
// main.ts から呼ばれる入口。テストからは fetch を注入して実サーバ非依存で検証する。

import type { ProjectGroup } from "../shared/index.js"
import { fetchTasks } from "./api/tasks.js"
import { ApiError } from "./api/client.js"
import { clear, el } from "./dom.js"
import { renderList } from "./render/list.js"
import type { GroupRenderOptions } from "./render/projectGroup.js"

/** アプリ内で参照する主要 DOM 要素の id / data 属性。 */
export const DOM_IDS = {
  app: "app",
  header: "app-header",
  taskList: "task-list",
  loading: "loading-indicator",
} as const

/** レイアウト（ヘッダ・操作領域・一覧コンテナ）を構築する。 */
export function renderLayout(root: Element): {
  header: HTMLElement
  controls: HTMLElement
  taskList: HTMLElement
} {
  clear(root)

  const title = el("h1", { className: "app-title", text: "task-bridge" })
  // 通知トグル・テーマ切替などを配置する領域（TASK-0023 が要素を差し込む）。
  const controls = el("div", {
    className: "header-controls",
    attrs: { "data-testid": "header-controls" },
  })
  const header = el("header", {
    className: "app-header",
    attrs: { id: DOM_IDS.header },
    children: [title, controls],
  })

  const taskList = el("main", {
    className: "task-list",
    attrs: { id: DOM_IDS.taskList, "aria-live": "polite" },
  })

  root.appendChild(header)
  root.appendChild(taskList)
  return { header, controls, taskList }
}

/** ローディングインジケータの表示/非表示を切り替える。 */
export function setLoading(container: Element, loading: boolean): void {
  const existing = container.querySelector(`#${DOM_IDS.loading}`)
  if (loading) {
    if (!existing) {
      container.appendChild(
        el("p", {
          className: "loading",
          text: "読み込み中...",
          attrs: { id: DOM_IDS.loading },
        }),
      )
    }
  } else if (existing) {
    existing.remove()
  }
}

/** 一覧ロードの結果。最後に取得した groups を保持する（SSE 再描画等で再利用）。 */
export interface LoadResult {
  groups: ProjectGroup[]
}

/**
 * GET /api/tasks を取得して一覧コンテナへ描画する。
 * 成功なら groups を返す。ApiError は onError ハンドラへ委譲し再 throw しない
 * （アプリを停止させない・NFR-303）。onError 未指定時は再 throw。
 */
export async function loadAndRenderTasks(
  container: Element,
  options: {
    fetchImpl?: typeof fetch
    onError?: (error: ApiError) => void
    render?: GroupRenderOptions
  } = {},
): Promise<LoadResult | null> {
  const fetchImpl = options.fetchImpl ?? fetch
  setLoading(container, true)
  try {
    const groups = await fetchTasks(fetchImpl)
    renderList(container, groups, options.render ?? {})
    return { groups }
  } catch (error) {
    if (error instanceof ApiError) {
      if (options.onError) {
        options.onError(error)
        return null
      }
    }
    throw error
  } finally {
    setLoading(container, false)
  }
}
