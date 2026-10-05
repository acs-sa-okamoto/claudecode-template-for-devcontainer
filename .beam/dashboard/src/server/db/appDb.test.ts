import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type DatabaseType from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { initAppDb, openAppDb } from "./appDb.js"

// 実 better-sqlite3 + 一時ファイル DB で検証する（WAL はメモリ DB で使えないためファイル）。

let dir: string
let dbPath: string
let db: DatabaseType.Database

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tb-appdb-"))
  dbPath = join(dir, "app.db")
})

afterEach(() => {
  if (db && db.open) db.close()
  rmSync(dir, { recursive: true, force: true })
})

const tableNames = (d: DatabaseType.Database): string[] =>
  (
    d
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>
  ).map((r) => r.name)

describe("openAppDb", () => {
  it("TC-01: 初回初期化で全テーブルを作成する", () => {
    // 【テスト目的】全テーブル作成（完了条件）
    // 【テスト内容】新規 DB を初期化
    // 【期待される動作】task_meta/notion_project/settings/sync_job が存在
    db = openAppDb(dbPath)
    const names = tableNames(db)
    expect(names).toContain("task_meta")
    expect(names).toContain("notion_project")
    expect(names).toContain("settings")
    expect(names).toContain("sync_job")
  })

  it("TC-02: 再初期化しても冪等（重複エラーなし）", () => {
    // 【テスト目的】冪等性（完了条件 / REQ-404）
    // 【テスト内容】同じ DB を2回初期化
    // 【期待される動作】例外を投げない
    db = openAppDb(dbPath)
    db.close()
    expect(() => {
      db = openAppDb(dbPath)
    }).not.toThrow()
  })

  it("TC-03: settings.notifications_enabled の初期値が true", () => {
    // 【テスト目的】通知 ON 既定（完了条件 / REQ-101）
    // 【テスト内容】初期化直後に settings を取得
    // 【期待される動作】notifications_enabled = 'true'
    db = openAppDb(dbPath)
    const row = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get("notifications_enabled") as { value: string } | undefined
    expect(row?.value).toBe("true")
  })

  it("TC-04: journal_mode が WAL", () => {
    // 【テスト目的】WAL 設定（NFR-402）
    // 【期待される動作】PRAGMA journal_mode が wal
    db = openAppDb(dbPath)
    const mode = db.pragma("journal_mode", { simple: true })
    expect(String(mode).toLowerCase()).toBe("wal")
  })

  it("TC-05: foreign_keys が ON", () => {
    // 【テスト目的】参照整合性 PRAGMA
    // 【期待される動作】foreign_keys = 1
    db = openAppDb(dbPath)
    const fk = db.pragma("foreign_keys", { simple: true })
    expect(Number(fk)).toBe(1)
  })

  it("TC-06: 再初期化で既存データが保持される", () => {
    // 【テスト目的】冪等かつ既存データ保持（完了条件）
    // 【テスト内容】settings に別キーを入れて再初期化
    // 【期待される動作】挿入したキーが残る
    db = openAppDb(dbPath)
    db.prepare("INSERT INTO settings(key, value) VALUES(?, ?)").run(
      "theme",
      "dark",
    )
    db.close()
    db = openAppDb(dbPath)
    const row = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get("theme") as { value: string } | undefined
    expect(row?.value).toBe("dark")
  })

  it("TC-07: initAppDb は AppConfig.APP_DB_PATH を使って初期化する", () => {
    // 【テスト目的】起動フロー統合（統合テスト要件）
    // 【テスト内容】config.APP_DB_PATH を指定
    // 【期待される動作】テーブル作成済みの DB が返る
    db = initAppDb({
      NOTION_API_TOKEN: "x",
      NOTION_PARENT_PAGE_ID: "y",
      SOURCE_DB_PATH: "/tmp/source.db",
      PORT: 3939,
      APP_DB_PATH: dbPath,
    })
    expect(tableNames(db)).toContain("task_meta")
  })

  it("TC-08: task_meta の不正な notion_sync_status は CHECK 違反", () => {
    // 【テスト目的】CHECK 制約（database-schema.sql）
    // 【テスト内容】enum 外の値を INSERT
    // 【期待される動作】throw され、行は挿入されない
    db = openAppDb(dbPath)
    expect(() => {
      db.prepare(
        "INSERT INTO task_meta(project, task_id, notion_sync_status) VALUES(?, ?, ?)",
      ).run("p", 1, "bogus")
    }).toThrow()
    const count = db
      .prepare("SELECT COUNT(*) AS c FROM task_meta")
      .get() as { c: number }
    expect(count.c).toBe(0)
  })

  it("TC-09: sync_job の不正な status は CHECK 違反", () => {
    // 【テスト目的】sync_job の CHECK 制約
    // 【期待される動作】throw
    db = openAppDb(dbPath)
    expect(() => {
      db.prepare(
        "INSERT INTO sync_job(job_id, project, total, status) VALUES(?, ?, ?, ?)",
      ).run("j1", "p", 10, "bogus")
    }).toThrow()
  })

  it("TC-10: 正常な task_meta INSERT は成功し取得できる", () => {
    // 【テスト目的】プレースホルダバインドでの正常書込
    // 【テスト内容】synced を挿入
    // 【期待される動作】挿入され取得できる
    db = openAppDb(dbPath)
    db.prepare(
      "INSERT INTO task_meta(project, task_id, notion_sync_status) VALUES(?, ?, ?)",
    ).run("task-bridge", 1, "synced")
    const row = db
      .prepare(
        "SELECT notion_sync_status AS s FROM task_meta WHERE project=? AND task_id=?",
      )
      .get("task-bridge", 1) as { s: string } | undefined
    expect(row?.s).toBe("synced")
  })
})
