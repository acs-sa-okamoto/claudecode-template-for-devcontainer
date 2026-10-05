import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { rotateIfNeeded } from "./rotation.js"

// 実ファイル I/O で回転を検証する（モックしない）。一時ディレクトリを使う。

let dir: string
let logPath: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tb-rotate-"))
  logPath = join(dir, "app.log")
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("rotateIfNeeded", () => {
  it("TC-01: 閾値超でローテーションし app.log.1 を生成する", () => {
    // 【テスト目的】サイズ超過時の回転（REQ-113）
    // 【テスト内容】10バイトのファイルに対し maxBytes=5 で回転
    // 【期待される動作】app.log.1 が生成され、app.log は消え、戻り値 true
    writeFileSync(logPath, "0123456789")
    const rotated = rotateIfNeeded(logPath, 5, 5)
    expect(rotated).toBe(true)
    expect(existsSync(logPath)).toBe(false)
    expect(existsSync(`${logPath}.1`)).toBe(true)
    expect(readFileSync(`${logPath}.1`, "utf8")).toBe("0123456789")
  })

  it("TC-02: 閾値以下なら何もしない", () => {
    // 【テスト目的】閾値以下では回転しない
    // 【テスト内容】3バイトに対し maxBytes=100
    // 【期待される動作】回転せず戻り値 false
    writeFileSync(logPath, "abc")
    const rotated = rotateIfNeeded(logPath, 100, 5)
    expect(rotated).toBe(false)
    expect(existsSync(`${logPath}.1`)).toBe(false)
  })

  it("TC-03: ファイル非存在なら何もしない", () => {
    // 【テスト目的】対象が無い場合の安全動作
    // 【テスト内容】存在しないパスで呼ぶ
    // 【期待される動作】戻り値 false、例外を投げない
    const rotated = rotateIfNeeded(logPath, 5, 5)
    expect(rotated).toBe(false)
  })

  it("TC-04: 既存世代がある状態で世代をシフトする", () => {
    // 【テスト目的】世代ファイルの順送り
    // 【テスト内容】app.log(gen0) と app.log.1(old) がある状態で回転
    // 【期待される動作】old が .2 へ、gen0 が .1 へ移る
    writeFileSync(`${logPath}.1`, "old1")
    writeFileSync(logPath, "current")
    rotateIfNeeded(logPath, 1, 5)
    expect(readFileSync(`${logPath}.1`, "utf8")).toBe("current")
    expect(readFileSync(`${logPath}.2`, "utf8")).toBe("old1")
  })

  it("TC-05: maxGenerations=5 で連続回転しても世代は最大5個", () => {
    // 【テスト目的】5世代上限と最古削除（REQ-113 / NFR-403、統合）
    // 【テスト内容】7回回転させる
    // 【期待される動作】.1〜.5 のみ存在し .6/.7 は存在しない
    for (let i = 0; i < 7; i++) {
      writeFileSync(logPath, `gen-${i}`)
      rotateIfNeeded(logPath, 1, 5)
    }
    for (let n = 1; n <= 5; n++) {
      expect(existsSync(`${logPath}.${n}`)).toBe(true)
    }
    expect(existsSync(`${logPath}.6`)).toBe(false)
    expect(existsSync(`${logPath}.7`)).toBe(false)
    // 最新（最後に書いた gen-6）が .1 に来る
    expect(readFileSync(`${logPath}.1`, "utf8")).toBe("gen-6")
  })
})
