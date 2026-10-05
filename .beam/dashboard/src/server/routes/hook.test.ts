// TASK-0017: hook 受信ルート（hook.ts）の単体・統合テスト。
//
// POST /api/hook を検証する。store / sseHub / notifier は注入で受けるため、
// 実 powershell / 実時間に依存しない。統合（TC-E2E-01）は :memory: MetaStore +
// 実 SseHub（フェイク SseClient）で update_badge と SSE 配信を確認する。

import Database from "better-sqlite3"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"
import { Hono } from "hono"
import type { HookEventType, TasksChangedEvent } from "../../shared/index.js"
import { MetaStore } from "../services/meta-store.js"
import { SseHub, type SseClient } from "../sse.js"
import { createHookRouter, type HookRouterDeps } from "./hook.js"

const SCHEMA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/schema.sql",
)

/** hook ルータをマウントした最小アプリ。 */
function makeApp(deps: HookRouterDeps): Hono {
  const app = new Hono()
  app.route("/api/hook", createHookRouter(deps))
  return app
}

/** store / sseHub / notifier のフェイクをまとめて作る。 */
function fakes(opts: { enabled?: boolean } = {}) {
  const setUpdateBadge = vi.fn()
  const onEvent = vi.fn()
  const broadcast = vi.fn(async () => {})
  const deps: HookRouterDeps = {
    store: {
      setUpdateBadge,
      getNotificationsEnabled: () => opts.enabled ?? true,
    },
    sseHub: { broadcast },
    notifier: { onEvent },
  }
  return { deps, setUpdateBadge, onEvent, broadcast }
}

function post(app: Hono, body: unknown) {
  return app.request("/api/hook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("hook 受信ルート（hook.ts）", () => {
  it("TC-01: 正常イベントで update_badge＋SSE push", async () => {
    // 【テスト目的】badge を立て tasks_changed を push すること（REQ-010）。
    // 【テスト内容】通知 ON で正常イベントを POST。
    // 【期待される動作】200・setUpdateBadge(projA,"12")・broadcast が該当 1 件で呼ばれる。
    const { deps, setUpdateBadge, broadcast } = fakes()
    const app = makeApp(deps)
    const res = await post(app, { type: "updated", project: "projA", taskId: "12" })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(setUpdateBadge).toHaveBeenCalledWith("projA", "12")
    expect(broadcast).toHaveBeenCalledTimes(1)
    const event = broadcast.mock.calls[0][0] as TasksChangedEvent
    expect(event.type).toBe("tasks_changed")
    expect(event.changedTaskIds).toEqual([{ project: "projA", taskId: "12" }])
  })

  it("TC-02: 通知 ON で集約投入（notifier.onEvent 呼出）", async () => {
    // 【テスト目的】通知 ON のとき onEvent を呼ぶこと（REQ-101）。
    const { deps, onEvent } = fakes({ enabled: true })
    const app = makeApp(deps)
    await post(app, { type: "updated", project: "projA", taskId: "1" })
    expect(onEvent).toHaveBeenCalledTimes(1)
  })

  it("TC-05: 全 type（added/deleted/status_changed）を受理", async () => {
    // 【テスト目的】列挙の全 type を受理すること。
    const types: HookEventType[] = ["added", "deleted", "status_changed"]
    for (const type of types) {
      const { deps } = fakes()
      const app = makeApp(deps)
      const res = await post(app, { type, project: "projA", taskId: "1" })
      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)
    }
  })

  it("TC-E01: taskId 空文字で VALIDATION_ERROR(400)・副作用なし", async () => {
    // 【テスト目的】空文字 taskId を拒否し副作用を起こさないこと（REQ-007）。
    // taskId は非空文字列（または数値）のみ受理する仕様（hook.ts validate）。
    const { deps, setUpdateBadge, broadcast, onEvent } = fakes()
    const app = makeApp(deps)
    const res = await post(app, { type: "updated", project: "projA", taskId: "" })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR")
    expect(setUpdateBadge).not.toHaveBeenCalled()
    expect(broadcast).not.toHaveBeenCalled()
    expect(onEvent).not.toHaveBeenCalled()
  })

  it("TC-E02: type 不正で VALIDATION_ERROR(400)・副作用なし", async () => {
    // 【テスト目的】列挙外 type を拒否すること。
    const { deps, setUpdateBadge } = fakes()
    const app = makeApp(deps)
    const res = await post(app, { type: "bogus", project: "projA", taskId: "1" })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR")
    expect(setUpdateBadge).not.toHaveBeenCalled()
  })

  it("TC-E03: project 欠落で VALIDATION_ERROR(400)", async () => {
    // 【テスト目的】project 非文字列/欠落を拒否すること。
    const { deps } = fakes()
    const app = makeApp(deps)
    const res = await post(app, { type: "updated", taskId: "1" })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR")
  })

  it("TC-E04: taskId が文字列・数値以外で VALIDATION_ERROR(400)", async () => {
    // 【テスト目的】文字列でも数値でもない taskId を拒否すること（hook.ts validate）。
    const { deps } = fakes()
    const app = makeApp(deps)
    const res = await post(app, { type: "updated", project: "projA", taskId: true })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR")
  })

  it("TC-B01: taskId=\"0\" は有効", async () => {
    // 【テスト目的】境界値 "0" を有効な taskId 文字列として扱うこと。
    const { deps, setUpdateBadge } = fakes()
    const app = makeApp(deps)
    const res = await post(app, { type: "updated", project: "projA", taskId: "0" })
    expect(res.status).toBe(200)
    expect(setUpdateBadge).toHaveBeenCalledWith("projA", "0")
  })

  it("TC-C01: 通知 OFF でも SSE push は継続・onEvent は呼ばれない", async () => {
    // 【テスト目的】OFF でトースト集約はしないが一覧更新は継続すること（REQ-102）。
    const { deps, broadcast, onEvent } = fakes({ enabled: false })
    const app = makeApp(deps)
    const res = await post(app, { type: "updated", project: "projA", taskId: "1" })
    expect(res.status).toBe(200)
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(onEvent).not.toHaveBeenCalled()
  })
})

describe("統合: hook 受信 → SSE で tasks_changed", () => {
  it("TC-E2E-01: 実 MetaStore + 実 SseHub で update_badge と SSE 配信が起きる", async () => {
    // 【テスト目的】実 MetaStore で badge=1、実 SseHub で tasks_changed が配信されること。
    // 【テスト内容】:memory: MetaStore に行を仕込み、フェイク SseClient を実 SseHub に登録。
    // 【期待される動作】POST 後、update_badge===1・SseClient が tasks_changed を受信。
    const db = new Database(":memory:")
    db.pragma("foreign_keys = ON")
    db.exec(readFileSync(SCHEMA_PATH, "utf8"))
    const store = new MetaStore(db)
    store.upsertTaskMeta({
      project: "projA",
      taskId: "5",
      notionSyncStatus: "not_synced",
      notionPageId: null,
      updateBadge: false,
      isDeleted: false,
      deletedSnapshot: null,
      lastError: null,
      metaUpdatedAt: "2026-06-03T10:00:00Z",
    })

    const hub = new SseHub()
    const received: { event?: string; data: string }[] = []
    const client: SseClient = {
      writeSSE: async (m) => {
        received.push(m)
      },
    }
    hub.add(client)

    const app = new Hono()
    app.route(
      "/api/hook",
      createHookRouter({
        store: {
          setUpdateBadge: (p, t) => store.setUpdateBadge(p, t),
          getNotificationsEnabled: () => store.getNotificationsEnabled(),
        },
        sseHub: hub,
        notifier: { onEvent: () => {} },
      }),
    )

    const res = await post(app, { type: "updated", project: "projA", taskId: "5" })
    expect(res.status).toBe(200)

    // update_badge が立っている。
    const meta = store.getTaskMeta("projA", "5")
    expect(meta?.updateBadge).toBe(true)

    // SSE クライアントが tasks_changed を受信している。
    expect(received).toHaveLength(1)
    expect(received[0].event).toBe("tasks_changed")
    const payload = JSON.parse(received[0].data) as TasksChangedEvent
    expect(payload.changedTaskIds).toEqual([{ project: "projA", taskId: "5" }])

    db.close()
  })
})
