import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  createLogger,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_GENERATIONS,
  type AppLogger,
} from "./index.js"

// 実ファイルへ同期出力し、書き込まれた内容を読み戻して検証する（モックしない）。

let dir: string
let logPath: string
let log: AppLogger

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tb-logger-"))
  logPath = join(dir, "app.log")
  log = createLogger({ filePath: logPath, sync: true })
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const readLog = (): string => readFileSync(logPath, "utf8")

describe("createLogger", () => {
  it("TC-06: トークンを含むオブジェクトは [Redacted] に伏せられる", () => {
    // 【テスト目的】機密非ログ化（P0 / NFR-104）
    // 【テスト内容】token/NOTION_API_TOKEN を含むオブジェクトを info で出力
    // 【期待される動作】平文トークンが出力に残らず Redacted 表記になる
    const secret = "ntn_super_secret_should_not_appear"
    log.info(
      { token: secret, NOTION_API_TOKEN: secret, nested: { token: secret } },
      "config loaded",
    )
    const content = readLog()
    expect(content).not.toContain(secret)
    expect(content).toContain("Redacted")
  })

  it("TC-07: logStartup が info レベルで起動を記録する", () => {
    // 【テスト目的】起動イベントの記録（REQ-012）
    // 【テスト内容】logStartup(3939)
    // 【期待される動作】起動メッセージとポートが記録される
    log.logStartup(3939)
    const content = readLog()
    expect(content).toContain("3939")
    expect(content).toMatch(/"level":30/)
  })

  it("TC-08: logDbError が error レベルで記録する", () => {
    // 【テスト目的】DB エラーの記録（REQ-012）
    // 【テスト内容】logDbError("接続失敗")
    // 【期待される動作】error レベルでメッセージが記録される
    log.logDbError("ソースDBに接続できません")
    const content = readLog()
    expect(content).toContain("ソースDBに接続できません")
    expect(content).toMatch(/"level":50/)
  })

  it("TC-09: logNotionSync が成否を記録する", () => {
    // 【テスト目的】Notion 連携成否の記録（REQ-012）
    // 【テスト内容】成功と失敗を1回ずつ
    // 【期待される動作】project/taskId と成否が記録される
    log.logNotionSync("task-bridge", 1, true)
    log.logNotionSync("task-bridge", 2, false)
    const content = readLog()
    expect(content).toContain("task-bridge")
    expect(content).toContain("\"taskId\":1")
    expect(content).toContain("\"taskId\":2")
  })

  it("TC-10: logNotification が件数を含めて記録する", () => {
    // 【テスト目的】通知発火の記録（REQ-012）
    // 【テスト内容】logNotification(3)
    // 【期待される動作】通知件数が記録される
    log.logNotification(3)
    const content = readLog()
    expect(content).toContain("\"count\":3")
  })

  it("TC-11: 既定の閾値・世代数が 100MB / 5 である", () => {
    // 【テスト目的】既定値が要件どおり（REQ-113 / NFR-403）
    // 【期待される動作】DEFAULT_MAX_BYTES=100MB、DEFAULT_MAX_GENERATIONS=5
    expect(DEFAULT_MAX_BYTES).toBe(100 * 1024 * 1024)
    expect(DEFAULT_MAX_GENERATIONS).toBe(5)
  })
})
