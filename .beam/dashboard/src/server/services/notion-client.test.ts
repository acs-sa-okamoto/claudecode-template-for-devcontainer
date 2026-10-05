import { describe, expect, it, vi } from "vitest"
import type { SourceTask } from "../../shared/index.js"
import {
  NotionApiError,
  NotionClient,
  type NotionFetch,
} from "./notion-client.js"

// 実 Notion API は叩かず、注入した fetch フェイクと sleep フェイクで検証する。

const TOKEN = "secret-token-DO-NOT-LEAK"
const PARENT = "parent-page-123"

/** Notion 風の Response を作る簡易ヘルパー。 */
function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

const sampleTask: SourceTask = {
  taskId: 42,
  project: "projA",
  title: "サンプル",
  content: "本文",
  status: "in_progress",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
}

function makeClient(
  fetchImpl: NotionFetch,
  opts: { sleep?: (ms: number) => Promise<void>; maxRetries?: number } = {},
): NotionClient {
  return new NotionClient({
    token: TOKEN,
    parentPageId: PARENT,
    fetch: fetchImpl,
    sleep: opts.sleep ?? (async () => {}),
    maxRetries: opts.maxRetries,
  })
}

describe("NotionClient", () => {
  it("TC-01: ページ登録で 7 プロパティを送信", async () => {
    let captured: { url: string; init: RequestInit } | null = null
    const client = makeClient(async (url, init) => {
      captured = { url: String(url), init: init ?? {} }
      return jsonResponse(200, { id: "page-1" })
    })
    const pageId = await client.createPage("db-1", sampleTask)
    expect(pageId).toBe("page-1")
    expect(captured).not.toBeNull()
    const body = JSON.parse(String(captured!.init.body))
    const props = body.properties
    // 7 プロパティすべてが含まれる
    for (const key of [
      "task_id",
      "title",
      "content",
      "project",
      "status",
      "created_at",
      "updated_at",
    ]) {
      expect(props).toHaveProperty(key)
    }
    // 親 DB が指定される
    expect(body.parent.database_id).toBe("db-1")
  })

  it("TC-02: 未作成 DB の自動作成", async () => {
    let captured: unknown = null
    const client = makeClient(async (_url, init) => {
      captured = JSON.parse(String((init ?? {}).body))
      return jsonResponse(200, { id: "db-created-99" })
    })
    const dbId = await client.createDatabase("projA")
    expect(dbId).toBe("db-created-99")
    const body = captured as { parent: { page_id: string }; title: unknown[] }
    expect(body.parent.page_id).toBe(PARENT)
    // タイトルにプロジェクト名が含まれる
    expect(JSON.stringify(body.title)).toContain("projA")
  })

  it("TC-03: 認証ヘッダ・バージョンヘッダが付与される", async () => {
    let headers: Headers | null = null
    const client = makeClient(async (_url, init) => {
      headers = new Headers((init ?? {}).headers)
      return jsonResponse(200, { id: "page-x" })
    })
    await client.createPage("db-1", sampleTask)
    expect(headers!.get("authorization")).toBe(`Bearer ${TOKEN}`)
    expect(headers!.get("notion-version")).toBeTruthy()
  })

  it("TC-E01: 3 回リトライ後に失敗（EDGE-002）", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(500, { message: "server error" }))
    const client = makeClient(fetchMock, { maxRetries: 3 })
    await expect(client.createPage("db-1", sampleTask)).rejects.toBeInstanceOf(
      NotionApiError,
    )
    // 初回 + リトライで合計 3 回（maxRetries=3 を試行回数の上限とする）
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("TC-E02: トークン・レスポンス本文が例外メッセージに含まれない", async () => {
    const client = makeClient(
      async () => jsonResponse(500, { secret_in_body: "leak-me" }),
      { maxRetries: 2 },
    )
    let caught: unknown
    try {
      await client.createPage("db-1", sampleTask)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(NotionApiError)
    const msg = (caught as Error).message
    expect(msg).not.toContain(TOKEN)
    expect(msg).not.toContain("leak-me")
  })

  it("TC-R01: 429 で Retry-After 秒だけ待機して再試行", async () => {
    const sleep = vi.fn(async () => {})
    let call = 0
    const client = makeClient(
      async () => {
        call += 1
        if (call === 1) {
          return jsonResponse(429, { message: "rate limited" }, { "retry-after": "2" })
        }
        return jsonResponse(200, { id: "page-ok" })
      },
      { sleep, maxRetries: 3 },
    )
    const pageId = await client.createPage("db-1", sampleTask)
    expect(pageId).toBe("page-ok")
    // Retry-After 2 秒 = 2000ms 待機
    expect(sleep).toHaveBeenCalledWith(2000)
  })

  it("TC-R02: Retry-After 欠落時は既定待機にフォールバック", async () => {
    const sleep = vi.fn(async () => {})
    let call = 0
    const client = makeClient(
      async () => {
        call += 1
        if (call === 1) return jsonResponse(429, { message: "rate limited" })
        return jsonResponse(200, { id: "page-ok" })
      },
      { sleep, maxRetries: 3 },
    )
    await client.createPage("db-1", sampleTask)
    expect(sleep).toHaveBeenCalled()
    expect(sleep.mock.calls[0]?.[0]).toBeGreaterThan(0)
  })

  it("TC-B01: 1 回目で成功すればリトライしない", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { id: "page-1" }))
    const client = makeClient(fetchMock)
    await client.createPage("db-1", sampleTask)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("TC-INT-01: DB 自動作成 → ページ登録 → 429 待機の一連", async () => {
    const sleep = vi.fn(async () => {})
    let phase = 0
    const client = makeClient(
      async (url) => {
        const u = String(url)
        if (u.endsWith("/databases")) {
          return jsonResponse(200, { id: "db-auto" })
        }
        // pages: 1回目 429、2回目 成功
        phase += 1
        if (phase === 1) {
          return jsonResponse(429, {}, { "retry-after": "1" })
        }
        return jsonResponse(200, { id: "page-final" })
      },
      { sleep, maxRetries: 3 },
    )
    const dbId = await client.createDatabase("projA")
    const pageId = await client.createPage(dbId, sampleTask)
    expect(dbId).toBe("db-auto")
    expect(pageId).toBe("page-final")
    expect(sleep).toHaveBeenCalledWith(1000)
  })

  it("TC-D01: deletePage は archived: true で PATCH する", async () => {
    let captured: { init: RequestInit } | null = null
    const client = makeClient(async (_url, init) => {
      captured = { init: init ?? {} }
      return jsonResponse(200, { id: "page-1", archived: true })
    })
    await client.deletePage("page-1")
    const body = JSON.parse(String(captured!.init.body))
    expect(body.archived).toBe(true)
    expect(captured!.init.method).toBe("PATCH")
  })
})
