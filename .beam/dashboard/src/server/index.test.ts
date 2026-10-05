// TASK-0014: Hono アプリ基盤（createApp）と起動バインドの統合・単体テスト。
//
// 実 Hono アプリを app.request() でインプロセス検証する（実サーバ・実ポート不要）。
// SSE はストリーム（text/event-stream）として確立されることと、broadcast が
// 接続中クライアントへ流れることを検証する。起動バインドは serve を注入して確認する。

import { describe, expect, it, vi } from "vitest"
import type { TasksChangedEvent } from "../shared/index.js"
import { createApp, startServer } from "./index.js"
import { SseHub } from "./sse.js"

const sampleEvent: TasksChangedEvent = {
  type: "tasks_changed",
  changedTaskIds: [{ project: "task-bridge", taskId: 12 }],
}

describe("createApp", () => {
  it("TC-04: /health が従来通り 200 と success を返す（回帰）", async () => {
    // 【テスト目的】既存 /health を壊していないこと。
    // 【テスト内容】GET /health。
    // 【期待される動作】200 / { success: true, data: { status: "ok" } }。
    const { app } = createApp()
    const res = await app.request("/health")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      success: true,
      data: { status: "ok" },
    })
  })

  it("TC-01: GET /api/events が text/event-stream を返す", async () => {
    // 【テスト目的】SSE エンドポイントがストリームを確立すること。
    // 【テスト内容】GET /api/events。
    // 【期待される動作】200 / Content-Type が text/event-stream。
    const { app } = createApp()
    const res = await app.request("/api/events")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    // リーダーを閉じてストリームを片付ける（ハングアップ防止）。
    await res.body?.cancel()
  })

  it("TC-E2E-01: 接続中クライアントへ broadcast した tasks_changed が流れる", async () => {
    // 【テスト目的】SSE 接続 → broadcast で実ストリームへイベントが届くこと。
    // 【テスト内容】GET /api/events で接続後、hub.broadcast を呼びストリームを読む。
    // 【期待される動作】受信テキストに event: tasks_changed と payload を含む。
    const hub = new SseHub()
    const { app } = createApp({ sseHub: hub })
    const res = await app.request("/api/events")
    expect(res.status).toBe(200)

    // 接続がハブに登録されるのを待つ（streamSSE のコールバック実行後）。
    await vi.waitFor(() => expect(hub.clientCount).toBe(1))

    await hub.broadcast(sampleEvent)

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    const { value } = await reader.read()
    const text = decoder.decode(value)
    expect(text).toContain("event: tasks_changed")
    expect(text).toContain(JSON.stringify(sampleEvent))

    await reader.cancel()
  })

  it("TC-S01: クロスオリジン要求に CORS 許可ヘッダを返さない", async () => {
    // 【テスト目的】CORS を許可しない（同一オリジンのみ）こと。
    // 【テスト内容】Origin ヘッダ付きで GET /health。
    // 【期待される動作】Access-Control-Allow-Origin ヘッダが存在しない。
    const { app } = createApp()
    const res = await app.request("/health", {
      headers: { Origin: "http://evil.example" },
    })
    expect(res.headers.get("access-control-allow-origin")).toBeNull()
  })
})

describe("startServer", () => {
  it("TC-S02: 127.0.0.1 にバインドし 0.0.0.0 を使わない", () => {
    // 【テスト目的】外部到達不能（NFR-102 / P0）を担保する起動設定。
    // 【テスト内容】serve をフェイク注入して startServer を呼ぶ。
    // 【期待される動作】serve に渡る hostname が 127.0.0.1。
    const serveSpy = vi.fn().mockReturnValue({ close: vi.fn() })
    startServer({
      port: 3939,
      serve: serveSpy,
      onListen: () => {},
    })
    const arg = serveSpy.mock.calls[0]?.[0] as { hostname: string }
    expect(arg.hostname).toBe("127.0.0.1")
    expect(arg.hostname).not.toBe("0.0.0.0")
  })
})
