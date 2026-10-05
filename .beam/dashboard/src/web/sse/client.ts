// SSE クライアント（ライブ更新）。
//
// GET /api/events を EventSource で購読し、`tasks_changed` 受信時に一覧を再取得
// （reload）して、changedTaskIds 該当行をハイライトする（REQ-010 / AC-12）。
// また各受信を onEvent で外部へ通知する（方式B のブラウザ通知の集約に使う）。
//
// EventSource は注入可能（テストでフェイク化し、実サーバ・実ブラウザに依存しない）。
// XSS（P0）: data はサーバ生成 JSON を parse するのみ。描画は textContent ベースの
// 既存レンダラ（renderList / markRowUpdated）を再利用する。

import type { TasksChangedEvent } from "../../shared/index.js"
import { markRowUpdated } from "../render/row.js"

/** EventSource の最小インターフェース（標準 EventSource と構造的に互換）。 */
export interface SseSource {
  addEventListener(
    type: string,
    listener: (event: MessageEvent) => void,
  ): void
  onerror: ((event: Event) => void) | null
  close(): void
}

/** EventSource を生成するファクトリ（テストでフェイクを注入）。 */
export type SseSourceFactory = (url: string) => SseSource

/** SSE クライアントの依存。 */
export interface SseClientDeps {
  /** ハイライト対象の一覧コンテナ。 */
  container: ParentNode
  /** tasks_changed 受信時に一覧を再取得・再描画するコールバック。 */
  reload: () => Promise<void>
  /**
   * 生の tasks_changed ごとに変更分を受け取るコールバック（任意）。
   * 方式B のブラウザ通知の集約に使う（reload のデバウンスとは独立に毎回呼ぶ）。
   */
  onEvent?: (changed: Array<{ project: string; taskId: string }>) => void
  /** EventSource ファクトリ（既定は標準 EventSource）。 */
  createSource?: SseSourceFactory
  /** 連続イベントをまとめるデバウンス ms（既定 0=即時）。 */
  debounceMs?: number
  /** setTimeout 注入（テスト用）。 */
  setTimeoutFn?: typeof setTimeout
}

const SSE_URL = "/api/events"
const SSE_EVENT = "tasks_changed"

/** 受信 data から changedTaskIds を安全に取り出す。不正は空配列。 */
function parseChangedTaskIds(
  data: string,
): Array<{ project: string; taskId: string }> {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return []
  }
  const evt = parsed as Partial<TasksChangedEvent>
  if (!Array.isArray(evt.changedTaskIds)) return []
  // allow-list: project(string)/taskId(string) のみ参照。不正要素はスキップ。
  return evt.changedTaskIds.filter(
    (c): c is { project: string; taskId: string } =>
      typeof c?.project === "string" && typeof c?.taskId === "string",
  )
}

/**
 * SSE 購読を開始する。戻り値の stop() で購読を解除する。
 */
export function startSseClient(deps: SseClientDeps): { stop: () => void } {
  const createSource =
    deps.createSource ?? ((url: string) => new EventSource(url) as SseSource)
  const timeoutFn = deps.setTimeoutFn ?? setTimeout
  const debounceMs = deps.debounceMs ?? 0

  const source = createSource(SSE_URL)
  let pending: Array<{ project: string; taskId: string }> = []
  let scheduled = false

  const flush = async (): Promise<void> => {
    scheduled = false
    const changed = pending
    pending = []
    // 再取得（一覧再描画）。失敗してもクラッシュさせない（NFR-303 同様）。
    try {
      await deps.reload()
    } catch {
      return
    }
    // 再描画後の DOM に対してハイライトを付与する（AC-12）。
    for (const { project, taskId } of changed) {
      markRowUpdated(deps.container, project, taskId)
    }
  }

  const onTasksChanged = (event: MessageEvent): void => {
    const changed = parseChangedTaskIds(String(event.data))
    // 方式B: 生イベントごとに通知集約へ供給する（reload デバウンスとは独立）。
    deps.onEvent?.(changed)
    pending.push(...changed)
    if (scheduled) return
    scheduled = true
    if (debounceMs > 0) {
      timeoutFn(() => {
        void flush()
      }, debounceMs)
    } else {
      void flush()
    }
  }

  source.addEventListener(SSE_EVENT, onTasksChanged)
  // 切断時: EventSource は標準で自動再接続するため、ここでは握りつぶしてクラッシュを防ぐ。
  source.onerror = (): void => {
    /* no-op: 自動再接続に委ねる */
  }

  return {
    stop: () => source.close(),
  }
}
