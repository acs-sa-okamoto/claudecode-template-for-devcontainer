// TASK-0014: SSE ハブ（接続管理 + tasks_changed の broadcast）
//
// 役割: 購読中の SSE クライアントを Set で管理し、サーバ内部からの
// broadcast 呼び出しで全クライアントへ `tasks_changed` イベントを配信する。
// 後続 Phase（hook 受信 TASK-0017）が hub.broadcast を呼んで一覧更新を push する。
//
// 設計判断: 実 Hono の SSEStreamingApi 全体には依存せず、配信に必要な最小契約
// （writeSSE）だけを SseClient として受け取る。これにより単体テストで実ストリーム
// なしに配信ロジックを検証できる（実ストリーム検証は index.test.ts の統合で担保）。
//
// セキュリティ（P0 出力エスケープ）: 配信 data はサーバ生成の固定構造を
// JSON.stringify した文字列のみ。任意 HTML は含めない（XSS 防止）。

import type { TasksChangedEvent } from "../shared/index.js"

/**
 * SSE クライアントの最小契約。
 * Hono の `SSEStreamingApi`（writeSSE を持つ）と構造的に互換。
 */
export interface SseClient {
  writeSSE(message: {
    data: string
    event?: string
    id?: string
  }): Promise<void>
}

/** SSE のイベント名（クライアントの addEventListener と一致させる）。 */
export const SSE_EVENT_TASKS_CHANGED = "tasks_changed"

/**
 * 購読中の SSE クライアントを集約し、イベントを配信するハブ。
 * アプリ寿命で 1 インスタンスを共有する（createApp で生成・注入）。
 */
export class SseHub {
  // 接続中クライアント集合。多重登録は Set により自然に排除される。
  private readonly clients = new Set<SseClient>()

  /** 現在の接続クライアント数（テスト・診断用）。 */
  get clientCount(): number {
    return this.clients.size
  }

  /** クライアントを登録する（SSE 接続確立時）。 */
  add(client: SseClient): void {
    this.clients.add(client)
  }

  /** クライアントを除去する（切断・abort 時）。 */
  remove(client: SseClient): void {
    this.clients.delete(client)
  }

  /**
   * 購読中の全クライアントへ `tasks_changed` を配信する。
   *
   * フェイルセーフ: 個別クライアントの書き込みが失敗しても他へは配信を継続し、
   * 失敗したクライアントは Hub から除去する（切断検知の代替）。
   */
  async broadcast(event: TasksChangedEvent): Promise<void> {
    // data はサーバ生成の固定構造のみ（XSS 防止 / P0）。
    const data = JSON.stringify(event)
    // 反復中の remove で集合が変化しないよう、スナップショットを取る。
    const snapshot = [...this.clients]
    await Promise.all(
      snapshot.map(async (client) => {
        try {
          await client.writeSSE({ event: SSE_EVENT_TASKS_CHANGED, data })
        } catch {
          // 書き込み失敗（切断済み等）は対象から除去する。理由は機密を含み得ないが
          // ログにも出さない（NFR-104 の方針に合わせ、配信失敗は静かに回収する）。
          this.clients.delete(client)
        }
      }),
    )
  }
}
