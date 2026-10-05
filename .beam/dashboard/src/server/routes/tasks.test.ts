// TASK-0015: GET /api/tasks ルートの単体・統合テスト。
//
// ルートは listTasks（= mergeTasks(reader, store) のラッパ）を注入で受ける。
// 実 Notion / 実ソース DB に依存せず、フェイク listTasks や :memory: MetaStore で検証する。

import Database from "better-sqlite3"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { Hono } from "hono"
import type { ProjectGroup, SourceTask } from "../../shared/index.js"
import { MetaStore } from "../services/meta-store.js"
import { mergeTasks, type SourceTaskProvider } from "../services/task-merger.js"
import { SourceDbConnectionError } from "../services/task-reader.js"
import { createTasksRouter } from "./tasks.js"

const SCHEMA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../db/schema.sql",
)

/** listTasks を注入した Hono アプリを作る（テスト用最小マウント）。 */
function makeApp(listTasks: () => ProjectGroup[]): Hono {
  const app = new Hono()
  app.route("/api/tasks", createTasksRouter({ listTasks }))
  return app
}

const group = (project: string, taskIds: string[]): ProjectGroup => ({
  project,
  notionLinked: false,
  tasks: taskIds.map((taskId) => ({
    taskId,
    project,
    title: `t${taskId}`,
    content: "",
    status: "ready",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    notionSyncStatus: "not_synced",
    isDeleted: false,
    updateBadge: false,
  })),
})

describe("GET /api/tasks", () => {
  it("TC-01: プロジェクト別グルーピングで返る", async () => {
    // 【テスト目的】projects 配列でプロジェクト別に返ること。
    // 【テスト内容】2 プロジェクトのマージ結果を返す listTasks を注入。
    // 【期待される動作】success:true・data.projects に 2 プロジェクト。
    const app = makeApp(() => [group("projA", ["1"]), group("projB", ["2"])])
    const res = await app.request("/api/tasks")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.projects.map((p: ProjectGroup) => p.project)).toEqual([
      "projA",
      "projB",
    ])
  })

  it("TC-02: 各プロジェクト内が task_id 昇順", async () => {
    // 【テスト目的】tasks が task_id 昇順で返ること（mergeTasks がソート済み）。
    // 【テスト内容】昇順の ProjectGroup を返す。
    // 【期待される動作】tasks の taskId が [1,2,3]。
    const app = makeApp(() => [group("projA", ["1", "2", "3"])])
    const res = await app.request("/api/tasks")
    const body = await res.json()
    expect(body.data.projects[0].tasks.map((t: { taskId: string }) => t.taskId)).toEqual(["1", "2", "3"])
  })

  it("TC-04: 1000 件を一括返却（ページネーションなし）", async () => {
    // 【テスト目的】最大 1000 件を一括返却すること（NFR-001）。
    // 【テスト内容】1000 件の tasks を返す。
    // 【期待される動作】data.projects[0].tasks.length === 1000。
    const ids = Array.from({ length: 1000 }, (_, i) => String(i + 1))
    const app = makeApp(() => [group("projA", ids)])
    const res = await app.request("/api/tasks")
    const body = await res.json()
    expect(body.data.projects[0].tasks).toHaveLength(1000)
  })

  it("TC-B01: タスク 0 件なら projects:[]", async () => {
    // 【テスト目的】空一覧でも正常レスポンス。
    const app = makeApp(() => [])
    const res = await app.request("/api/tasks")
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.projects).toEqual([])
  })

  it("TC-E01: DB 接続失敗で DB_CONNECTION_FAILED・クラッシュしない", async () => {
    // 【テスト目的】SourceDbConnectionError を捕捉し規定エラーを返す（NFR-303）。
    // 【テスト内容】listTasks が SourceDbConnectionError を throw。
    // 【期待される動作】success:false・code DB_CONNECTION_FAILED、例外は外に出ない。
    const app = makeApp(() => {
      throw new SourceDbConnectionError("ソース DB に接続できません")
    })
    const res = await app.request("/api/tasks")
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("DB_CONNECTION_FAILED")
  })

  it("TC-E02: 想定外の例外も DB_CONNECTION_FAILED に丸める", async () => {
    // 【テスト目的】未分類例外でもフェイルクローズで安全側に倒す。
    const app = makeApp(() => {
      throw new Error("unexpected")
    })
    const res = await app.request("/api/tasks")
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe("DB_CONNECTION_FAILED")
  })

  it("TC-E2E-01: 実 MetaStore + フェイク Reader で mergeTasks 経由の一覧が返る", async () => {
    // 【テスト目的】実 SQLite メタ DB と mergeTasks を結線した listTasks が機能すること。
    // 【テスト内容】:memory: MetaStore と SourceTaskProvider を mergeTasks に渡す。
    // 【期待される動作】マージ済み一覧が project 別・task_id 昇順で返る。
    const db = new Database(":memory:")
    db.pragma("foreign_keys = ON")
    db.exec(readFileSync(SCHEMA_PATH, "utf8"))
    const store = new MetaStore(db)

    const sources: SourceTask[] = [
      { taskId: "2", project: "projA", title: "b", content: "", status: "ready", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      { taskId: "1", project: "projA", title: "a", content: "", status: "ready", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    ]
    const reader: SourceTaskProvider = { readAllTasks: () => sources }

    const app = makeApp(() => mergeTasks(reader, store))
    const res = await app.request("/api/tasks")
    const body = await res.json()
    expect(body.data.projects[0].project).toBe("projA")
    expect(body.data.projects[0].tasks.map((t: { taskId: string }) => t.taskId)).toEqual(["1", "2"])
    db.close()
  })
})
