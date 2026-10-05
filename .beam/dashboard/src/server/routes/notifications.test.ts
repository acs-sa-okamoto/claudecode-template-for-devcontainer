// TASK-0018: 通知設定ルート（notifications.ts）の単体・統合テスト。
//
// GET /api/notifications（現在値）と POST /api/notifications（切替・永続化）を検証する。
// store は注入で受ける。統合（TC-E2E-01）は :memory: MetaStore で POST→GET の反映を確認する。

import Database from "better-sqlite3"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"
import { Hono } from "hono"
import { MetaStore } from "../services/meta-store.js"
import {
  createNotificationsRouter,
  type NotificationsRouterDeps,
} from "./notifications.js"

const SCHEMA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/schema.sql",
)

/** notifications ルータをマウントした最小アプリ。 */
function makeApp(deps: NotificationsRouterDeps): Hono {
  const app = new Hono()
  app.route("/api/notifications", createNotificationsRouter(deps))
  return app
}

function postJson(app: Hono, body: string) {
  return app.request("/api/notifications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  })
}

describe("通知設定ルート（notifications.ts）", () => {
  it("TC-01: GET で現在値を返す", async () => {
    // 【テスト目的】getNotificationsEnabled の値を返すこと。
    // 【テスト内容】ON を返す store を注入し GET。
    // 【期待される動作】200・data.notificationsEnabled===true。
    const app = makeApp({
      store: { getNotificationsEnabled: () => true, setNotificationsEnabled: vi.fn() },
    })
    const res = await app.request("/api/notifications")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.notificationsEnabled).toBe(true)
  })

  it("TC-02: POST {enabled:false} で OFF を永続化し切替後値を返す", async () => {
    // 【テスト目的】setNotificationsEnabled(false) を呼び切替後値を返すこと（REQ-101/102）。
    const setNotificationsEnabled = vi.fn()
    let current = true
    const app = makeApp({
      store: {
        getNotificationsEnabled: () => current,
        setNotificationsEnabled: (v) => {
          current = v
          setNotificationsEnabled(v)
        },
      },
    })
    const res = await postJson(app, JSON.stringify({ enabled: false }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.notificationsEnabled).toBe(false)
    expect(setNotificationsEnabled).toHaveBeenCalledWith(false)
  })

  it("TC-03: POST {enabled:true} で ON を永続化", async () => {
    // 【テスト目的】true でも正しく永続化・返却すること。
    let current = false
    const app = makeApp({
      store: {
        getNotificationsEnabled: () => current,
        setNotificationsEnabled: (v) => {
          current = v
        },
      },
    })
    const res = await postJson(app, JSON.stringify({ enabled: true }))
    const body = await res.json()
    expect(body.data.notificationsEnabled).toBe(true)
  })

  it("TC-E01: enabled 非 boolean で VALIDATION_ERROR(400)・永続化なし", async () => {
    // 【テスト目的】非 boolean を拒否し永続化しないこと（テストケース3）。
    const setNotificationsEnabled = vi.fn()
    const app = makeApp({
      store: { getNotificationsEnabled: () => true, setNotificationsEnabled },
    })
    const res = await postJson(app, JSON.stringify({ enabled: "yes" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR")
    expect(setNotificationsEnabled).not.toHaveBeenCalled()
  })

  it("TC-E02: enabled 欠落で VALIDATION_ERROR(400)", async () => {
    // 【テスト目的】enabled 欠落を拒否すること。
    const app = makeApp({
      store: { getNotificationsEnabled: () => true, setNotificationsEnabled: vi.fn() },
    })
    const res = await postJson(app, JSON.stringify({}))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR")
  })

  it("TC-E03: JSON パース失敗で VALIDATION_ERROR(400)", async () => {
    // 【テスト目的】不正 JSON を拒否すること。
    const app = makeApp({
      store: { getNotificationsEnabled: () => true, setNotificationsEnabled: vi.fn() },
    })
    const res = await postJson(app, "{not json")
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR")
  })
})

describe("統合: POST 後に GET で反映", () => {
  it("TC-E2E-01: 実 MetaStore で POST→GET の永続化が反映される", async () => {
    // 【テスト目的】実 settings 永続化が GET に反映されること（REQ-101/102）。
    // 【テスト内容】:memory: MetaStore で POST {enabled:false} → GET。
    // 【期待される動作】GET の notificationsEnabled===false。
    const db = new Database(":memory:")
    db.pragma("foreign_keys = ON")
    db.exec(readFileSync(SCHEMA_PATH, "utf8"))
    const store = new MetaStore(db)

    const app = new Hono()
    app.route(
      "/api/notifications",
      createNotificationsRouter({
        store: {
          getNotificationsEnabled: () => store.getNotificationsEnabled(),
          setNotificationsEnabled: (v) => store.setNotificationsEnabled(v),
        },
      }),
    )

    // 初期は ON（schema 初期データ）。
    const before = await (await app.request("/api/notifications")).json()
    expect(before.data.notificationsEnabled).toBe(true)

    await postJson(app, JSON.stringify({ enabled: false }))

    const after = await (await app.request("/api/notifications")).json()
    expect(after.data.notificationsEnabled).toBe(false)

    db.close()
  })
})
