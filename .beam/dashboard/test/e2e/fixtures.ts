// E2E ハーネス + 外部依存スタブ（TASK-0026）。
//
// 実 Hono サーバ（127.0.0.1）+ 実 MetaStore（一時 SQLite）+ 実 TaskReader（一時ソース DB）
// + 実フロント（dist/web）を「テストプロセス内」で起動する。外部依存だけをスタブ化する:
//   - Notion: NotionClient の fetch を記録付きスタブに差し替え（実 API 非通信 / EDGE-005）。
//   - powershell.exe: Notifier の fireToast を記録付きスタブに差し替え（実プロセス非起動）。
//
// スタブ状態（呼び出し回数）をテストとサーバで共有するため、サーバは別プロセスにしない。
//
// セキュリティ: ダミー値のみ使用（機密なし）。サーバは 127.0.0.1 バインド（NFR-102）。

import { serve } from "@hono/node-server"
import type { ServerType } from "@hono/node-server"
import Database from "better-sqlite3"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openAppDb } from "../../src/server/db/appDb.js"
import type { AppConfig } from "../../src/server/config/env.js"
import { buildAppBundle, type WiredBundle } from "../../src/server/wiring.js"

/** ソース DB に投入する 1 タスク。 */
export interface SeedTask {
  taskId: number
  title: string
  content?: string
  status: "ready" | "in_progress" | "in_review" | "done"
  createdAt?: string
  updatedAt?: string
}

/** プロジェクト（=ソース DB のテーブル）ごとの初期タスク。 */
export type SeedData = Record<string, SeedTask[]>

/** Notion / powershell スタブの呼び出し記録。 */
export interface StubCalls {
  /** createDatabase（POST /databases）の回数。 */
  createDatabase: number
  /** createPage（POST /pages）の回数。 */
  createPage: number
  /** deletePage（PATCH /pages/:id archived:true）の回数。 */
  deletePage: number
  /** fireToast（powershell.exe 相当）の発火件数の履歴。 */
  toastCounts: number[]
  /** 実 powershell.exe spawn が呼ばれた回数（常に 0 であるべき）。 */
  realSpawn: number
}

/** 起動済みテストサーバのハンドル。 */
export interface TestServer {
  /** ベース URL（例: http://127.0.0.1:PORT）。 */
  baseUrl: string
  /** スタブ呼び出し記録（参照を共有。アサートに使う）。 */
  calls: StubCalls
  /** hook を 1 件投入する（POST /api/hook）。 */
  postHook(event: {
    type: "added" | "updated" | "deleted" | "status_changed"
    project: string
    taskId: number
  }): Promise<Response>
  /** メタ DB へ直接 task_meta を書く（前提状態の作成用：synced 行など）。 */
  seedMeta(row: {
    project: string
    taskId: number
    notionSyncStatus: string
    notionPageId?: string | null
  }): void
  /** 後始末（サーバ停止・一時 DB 削除）。 */
  close(): Promise<void>
}

/** ソース DB（読取専用想定だがフィクスチャ作成時のみ書込）を生成しシードする。 */
function createSourceDb(path: string, seed: SeedData): void {
  const db = new Database(path)
  try {
    for (const [project, tasks] of Object.entries(seed)) {
      // テーブル名はテストフィクスチャ固定値（外部入力ではない）。識別子をクォートする。
      const table = `"${project.replace(/"/g, '""')}"`
      db.exec(
        `CREATE TABLE IF NOT EXISTS ${table} (
          task_id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
      )
      const insert = db.prepare(
        `INSERT INTO ${table} (task_id, title, content, status, created_at, updated_at)
         VALUES (@taskId, @title, @content, @status, @createdAt, @updatedAt)`,
      )
      for (const t of tasks) {
        insert.run({
          taskId: t.taskId,
          title: t.title,
          content: t.content ?? "",
          status: t.status,
          createdAt: t.createdAt ?? "2026-06-01T00:00:00Z",
          updatedAt: t.updatedAt ?? "2026-06-01T00:00:00Z",
        })
      }
    }
  } finally {
    db.close()
  }
}

/** Notion 公式 API を模したフェイク fetch（実通信なし）。呼び出しを calls に記録する。 */
function createNotionFetchStub(calls: StubCalls) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? "GET").toUpperCase()
    const ok = (body: unknown): Response =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      })

    if (url.endsWith("/databases") && method === "POST") {
      calls.createDatabase += 1
      return ok({ id: `db-stub-${calls.createDatabase}` })
    }
    if (url.endsWith("/pages") && method === "POST") {
      calls.createPage += 1
      return ok({ id: `page-stub-${calls.createPage}` })
    }
    if (url.includes("/pages/") && method === "PATCH") {
      // archived: true（削除）。
      calls.deletePage += 1
      return ok({ id: "archived", archived: true })
    }
    // 想定外のエンドポイントは 404（テストで気づけるように）。
    return new Response(JSON.stringify({ message: "unexpected stub call" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    })
  }
}

/**
 * E2E 用テストサーバを起動する。
 * - 一時ディレクトリに source.db / app.db を作る（テスト終了で破棄）。
 * - Notion fetch / toast fireToast をスタブ化（外部呼び出しゼロ）。
 * - 一括同期スロットリングは 0（テスト高速化）。
 */
export async function startTestServer(seed: SeedData): Promise<TestServer> {
  const dir = mkdtempSync(join(tmpdir(), "task-bridge-e2e-"))
  const sourceDbPath = join(dir, "source.db")
  const appDbPath = join(dir, "app.db")

  createSourceDb(sourceDbPath, seed)

  const calls: StubCalls = {
    createDatabase: 0,
    createPage: 0,
    deletePage: 0,
    toastCounts: [],
    realSpawn: 0,
  }

  const config: AppConfig = {
    NOTION_API_TOKEN: "dummy-token-not-a-real-secret",
    NOTION_PARENT_PAGE_ID: "dummy-parent-page-id",
    SOURCE_DB_PATH: sourceDbPath,
    PORT: 0, // serve が空きポートを割り当てる。
    APP_DB_PATH: appDbPath,
  }

  // メタ DB はハーネス側で開いて wiring へ注入する（seedMeta で直接書けるように）。
  const db = openAppDb(appDbPath)

  const bundle: WiredBundle = buildAppBundle({
    config,
    db,
    notionFetch: createNotionFetchStub(calls),
    // Notion リトライ sleep を即時化（テストが待たない）。
    notionSleep: async () => {},
    // powershell.exe 起動の代わりに件数を記録するだけ（実プロセス非起動）。
    fireToast: (count: number) => {
      calls.toastCounts.push(count)
    },
    // 一括同期のスロットリングを無効化（E2E を高速・安定化）。
    throttleMs: 0,
  })

  // 127.0.0.1 にバインドして起動し、割り当てポートを取得する（NFR-102）。
  const server: ServerType = await new Promise((resolve) => {
    const s = serve(
      { fetch: bundle.app.fetch, hostname: "127.0.0.1", port: 0 },
      () => resolve(s),
    )
  })
  const address = server.address()
  const port =
    typeof address === "object" && address ? address.port : config.PORT
  const baseUrl = `http://127.0.0.1:${port}`

  return {
    baseUrl,
    calls,
    async postHook(event) {
      return fetch(`${baseUrl}/api/hook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      })
    },
    seedMeta(row) {
      db.prepare(
        `INSERT INTO task_meta (project, task_id, notion_sync_status, notion_page_id)
         VALUES (@project, @taskId, @notionSyncStatus, @notionPageId)
         ON CONFLICT(project, task_id) DO UPDATE SET
           notion_sync_status = excluded.notion_sync_status,
           notion_page_id = excluded.notion_page_id`,
      ).run({
        project: row.project,
        taskId: row.taskId,
        notionSyncStatus: row.notionSyncStatus,
        notionPageId: row.notionPageId ?? null,
      })
    },
    async close() {
      // SSE 接続が開いたままだと server.close() はドレインを待って解決しない。
      // 先に既存接続を強制切断してから close する（Node 18.2+ の closeAllConnections）。
      const httpServer = server as unknown as {
        closeAllConnections?: () => void
      }
      httpServer.closeAllConnections?.()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      bundle.reader.close()
      db.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
