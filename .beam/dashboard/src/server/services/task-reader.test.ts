import { mkdtempSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { TaskReader } from "./task-reader.js"

// 実 better-sqlite3 + 一時ファイル DB で検証する（モックを使わず実 DB で動作確認）。

let dir: string
let dbPath: string

/** テスト用ソース DB を作成する（プロジェクト=テーブル構造）。 */
function createSourceDb(): void {
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE "projA" (
      task_id    INTEGER PRIMARY KEY,
      title      TEXT NOT NULL,
      content    TEXT,
      status     TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE "projB" (
      task_id    INTEGER PRIMARY KEY,
      title      TEXT NOT NULL,
      content    TEXT,
      status     TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)
  const insA = db.prepare(
    "INSERT INTO \"projA\"(task_id, title, content, status, created_at, updated_at) VALUES(?,?,?,?,?,?)",
  )
  // task_id を順不同で投入（昇順ソート検証用）
  insA.run(3, "A-3", "c3", "ready", "2026-01-03T00:00:00Z", "2026-01-03T00:00:00Z")
  insA.run(1, "A-1", "c1", "in_progress", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z")
  insA.run(2, "A-2", "c2", "done", "2026-01-02T00:00:00Z", "2026-01-02T00:00:00Z")
  const insB = db.prepare(
    "INSERT INTO \"projB\"(task_id, title, content, status, created_at, updated_at) VALUES(?,?,?,?,?,?)",
  )
  insB.run(10, "B-10", "bc", "in_review", "2026-02-10T00:00:00Z", "2026-02-10T00:00:00Z")
  db.close()
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tb-reader-"))
  dbPath = join(dir, "source.db")
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("TaskReader", () => {
  it("TC-01: 複数プロジェクトテーブルを正しく読む", () => {
    // 【テスト目的】全テーブル走査（REQ-002/402）
    // 【テスト内容】projA(3) + projB(1) を読む
    // 【期待される動作】4 件取得され project が付与される
    createSourceDb()
    const reader = new TaskReader(dbPath)
    const tasks = reader.readAllTasks()
    reader.close()
    expect(tasks).toHaveLength(4)
    expect(tasks.filter((t) => t.project === "projA")).toHaveLength(3)
    expect(tasks.filter((t) => t.project === "projB")).toHaveLength(1)
  })

  it("TC-02: task_id 昇順で返る", () => {
    // 【テスト目的】並び順（REQ-003）
    // 【テスト内容】順不同で投入した projA を読む
    // 【期待される動作】task_id が 1,2,3 の順
    createSourceDb()
    const reader = new TaskReader(dbPath)
    const a = reader.readProjectTasks("projA")
    reader.close()
    expect(a.map((t) => t.taskId)).toEqual([1, 2, 3])
  })

  it("TC-03: readonly で開きソース DB が書き換わらない", () => {
    // 【テスト目的】readonly 接続（NFR-303 / 注意事項）
    // 【テスト内容】読取前後で mtime 不変・書込試行が失敗
    createSourceDb()
    const before = statSync(dbPath).mtimeMs
    const reader = new TaskReader(dbPath)
    reader.readAllTasks()
    // readonly のため書込はできない（better-sqlite3 が例外を投げる）
    expect(() => reader.rawWriteForTest()).toThrow()
    reader.close()
    const after = statSync(dbPath).mtimeMs
    expect(after).toBe(before)
  })

  it("TC-04: listProjects が検証通過テーブルのみ返す", () => {
    // 【テスト目的】テーブル列挙（REQ-402）
    // 【期待される動作】projA, projB を含む（sqlite_* を含まない）
    createSourceDb()
    const reader = new TaskReader(dbPath)
    const projects = reader.listProjects()
    reader.close()
    expect(projects).toContain("projA")
    expect(projects).toContain("projB")
    expect(projects.some((p) => p.startsWith("sqlite_"))).toBe(false)
  })

  it("TC-05: SourceTask の全フィールドが正しくマッピングされる", () => {
    // 【テスト目的】マッピング（interfaces.ts）
    // 【期待される動作】各フィールドが一致
    createSourceDb()
    const reader = new TaskReader(dbPath)
    const a1 = reader.readProjectTasks("projA")[0]
    reader.close()
    expect(a1).toEqual({
      taskId: 1,
      project: "projA",
      title: "A-1",
      content: "c1",
      status: "in_progress",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    })
  })

  it("TC-E01: ソース DB 不在時は空一覧（クラッシュせず、後で作成されたら拾う）", () => {
    // 【テスト目的】view モードで beam がまだソース DB を作っていない状態を許容する。
    //   不在＝エラーではなく「まだタスクが無い」＝空として扱い、起動を妨げない。
    // 【期待される動作】コンストラクタも読取も throw せず空配列。後から DB が作られたら拾える。
    const missing = join(dir, "later.db")
    const reader = new TaskReader(missing)
    expect(reader.listProjects()).toEqual([])
    expect(reader.readAllTasks()).toEqual([])

    // 後から beam がソース DB を作成 → 次回の読取で拾える（遅延オープン）。
    const db = new Database(missing)
    db.exec(
      "CREATE TABLE \"projX\" (task_id INTEGER PRIMARY KEY, title TEXT NOT NULL, content TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);",
    )
    db.prepare(
      "INSERT INTO \"projX\"(task_id, title, content, status, created_at, updated_at) VALUES(?,?,?,?,?,?)",
    ).run(1, "X-1", "c", "ready", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z")
    db.close()

    const tasks = reader.readAllTasks()
    reader.close()
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.project).toBe("projX")
  })

  it("TC-E02: 不正なテーブル名を弾く", () => {
    // 【テスト目的】SQL インジェクション対策（architecture.md セキュリティ P0）
    // 【テスト内容】識別子パターンに反する名前のテーブルを作る
    // 【期待される動作】そのテーブルは列挙・読取対象から除外される
    const db = new Database(dbPath)
    db.exec(
      "CREATE TABLE \"bad-name; DROP\" (task_id INTEGER PRIMARY KEY, title TEXT NOT NULL, content TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);",
    )
    db.exec(
      "CREATE TABLE \"good\" (task_id INTEGER PRIMARY KEY, title TEXT NOT NULL, content TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);",
    )
    db.close()
    const reader = new TaskReader(dbPath)
    const projects = reader.listProjects()
    // 不正名は除外、good は含まれる。例外なく安全に処理される。
    const tasks = reader.readAllTasks()
    reader.close()
    expect(projects).toContain("good")
    expect(projects).not.toContain("bad-name; DROP")
    expect(tasks.every((t) => t.project === "good")).toBe(true)
  })

  it("TC-E03: task_id 列を持たないテーブルは除外", () => {
    // 【テスト目的】タスクテーブル以外の除外（REQ-402 妥当な推測）
    const db = new Database(dbPath)
    db.exec("CREATE TABLE \"meta_aux\" (k TEXT PRIMARY KEY, v TEXT);")
    db.exec(
      "CREATE TABLE \"projC\" (task_id INTEGER PRIMARY KEY, title TEXT NOT NULL, content TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);",
    )
    db.close()
    const reader = new TaskReader(dbPath)
    const projects = reader.listProjects()
    reader.close()
    expect(projects).toContain("projC")
    expect(projects).not.toContain("meta_aux")
  })

  it("TC-B01: テーブル 0 件なら空配列", () => {
    // 【テスト目的】境界（タスクテーブルが 1 つも無い DB）
    // ファイルは存在するがタスクテーブルが無い状態を作る（補助テーブルのみ）。
    const db = new Database(dbPath)
    db.exec("CREATE TABLE aux_only (k TEXT PRIMARY KEY, v TEXT);")
    db.close()
    const reader = new TaskReader(dbPath)
    const tasks = reader.readAllTasks()
    reader.close()
    expect(tasks).toEqual([])
  })

  it("TC-INT-01: 実ファイルのソース DB に対する読取（統合）", () => {
    // 【テスト目的】統合（REQ-001/002）
    // 【期待される動作】全テーブルの SourceTask が task_id 昇順で取得・ファイル不変
    createSourceDb()
    const before = statSync(dbPath).mtimeMs
    const reader = new TaskReader(dbPath)
    const tasks = reader.readAllTasks()
    reader.close()
    const after = statSync(dbPath).mtimeMs
    expect(tasks.length).toBe(4)
    // プロジェクト内で task_id 昇順
    const aIds = tasks.filter((t) => t.project === "projA").map((t) => t.taskId)
    expect(aIds).toEqual([1, 2, 3])
    expect(after).toBe(before)
  })
})
