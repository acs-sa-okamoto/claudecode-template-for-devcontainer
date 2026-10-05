// TASK-0014: SSE ハブ（SseHub）と broadcast 機構の単体テスト。
//
// 実 Hono の SSEStreamingApi には依存せず、最小の writeSSE インターフェースを
// 満たすフェイククライアントを注入して接続管理・配信・除去を検証する。
// （実ストリームの text/event-stream 検証は index.test.ts のインプロセス統合で行う）

import { describe, expect, it, vi } from "vitest"
import type { TasksChangedEvent } from "../shared/index.js"
import { SseHub, type SseClient } from "./sse.js"

/** writeSSE を記録するフェイク SSE クライアント。 */
function makeFakeClient(): SseClient & { sent: unknown[] } {
  const sent: unknown[] = []
  return {
    sent,
    async writeSSE(message): Promise<void> {
      sent.push(message)
    },
  }
}

const sampleEvent: TasksChangedEvent = {
  type: "tasks_changed",
  changedTaskIds: [{ project: "task-bridge", taskId: 12 }],
}

describe("SseHub", () => {
  it("TC-03: 登録済みの複数クライアントへ tasks_changed を配信する", async () => {
    // 【テスト目的】broadcast が登録中の全クライアントへ届くこと。
    // 【テスト内容】2 クライアント登録 → broadcast。
    // 【期待される動作】両クライアントが event: tasks_changed と payload を受信。
    const hub = new SseHub()
    const a = makeFakeClient()
    const b = makeFakeClient()
    hub.add(a)
    hub.add(b)

    await hub.broadcast(sampleEvent)

    expect(hub.clientCount).toBe(2)
    for (const client of [a, b]) {
      expect(client.sent).toHaveLength(1)
      expect(client.sent[0]).toMatchObject({
        event: "tasks_changed",
        data: JSON.stringify(sampleEvent),
      })
    }
  })

  it("TC-E01: 除去したクライアントには配信されない", async () => {
    // 【テスト目的】切断後（remove 後）のクライアントが配信対象から外れること。
    // 【テスト内容】登録 → remove → broadcast。
    // 【期待される動作】clientCount が 0、writeSSE は呼ばれない。
    const hub = new SseHub()
    const a = makeFakeClient()
    hub.add(a)
    hub.remove(a)

    await hub.broadcast(sampleEvent)

    expect(hub.clientCount).toBe(0)
    expect(a.sent).toHaveLength(0)
  })

  it("TC-E02: 書き込み失敗クライアントは除去し、他へは配信継続する", async () => {
    // 【テスト目的】1 クライアントの送信失敗が他へ波及しない（フェイルセーフ）。
    // 【テスト内容】throw する偽クライアントと正常クライアントを登録 → broadcast。
    // 【期待される動作】正常側は受信、失敗側は Hub から除去される。
    const hub = new SseHub()
    const failing: SseClient = {
      writeSSE: vi.fn().mockRejectedValue(new Error("broken pipe")),
    }
    const ok = makeFakeClient()
    hub.add(failing)
    hub.add(ok)

    await hub.broadcast(sampleEvent)

    expect(ok.sent).toHaveLength(1)
    expect(hub.clientCount).toBe(1) // 失敗側が除去され ok のみ残る
  })

  it("TC-B01: クライアント 0 件での broadcast は無害", async () => {
    // 【テスト目的】購読者ゼロでも例外を投げないこと。
    // 【テスト内容】登録せず broadcast。
    // 【期待される動作】resolve し、clientCount は 0。
    const hub = new SseHub()
    await expect(hub.broadcast(sampleEvent)).resolves.toBeUndefined()
    expect(hub.clientCount).toBe(0)
  })
})
