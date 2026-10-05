// TASK-0013: トースト発火 fireToast の単体テスト。
//
// 実 powershell.exe は起動せず、注入した spawn フェイクで呼び出し引数を検証する。
// 件数 N の数値検証（コマンドインジェクション防止 P0）を重点的に確認する。

import { describe, expect, it, vi } from "vitest"
import { fireToast } from "./toast.js"

describe("fireToast", () => {
  it("TS-01: powershell.exe を引数配列で起動し -Count に数値文字列を渡す（shell 非経由）", () => {
    // 【テスト目的】spawn の引数配列でコマンドを渡すこと（NFR-003）。
    // 【テスト内容】N=3 で発火。
    // 【期待される動作】command="powershell.exe"、args に "-Count","3" を含む。shell オプション無し。
    const spawnFn = vi.fn(() => ({}))
    fireToast(3, { spawnFn })

    expect(spawnFn).toHaveBeenCalledTimes(1)
    const [command, args, options] = spawnFn.mock.calls[0] as [string, string[], unknown]
    expect(command).toBe("powershell.exe")
    expect(Array.isArray(args)).toBe(true)
    expect(args).toContain("-Count")
    expect(args).toContain("3")
    // shell:true でないこと（シェル経由のインジェクション防止）。
    expect((options as { shell?: boolean } | undefined)?.shell).not.toBe(true)
  })

  it("TS-02: N が不正（負/小数/NaN）なら throw し spawn を呼ばない", () => {
    // 【テスト目的】数値検証でコマンドインジェクションを防ぐこと（P0）。
    const spawnFn = vi.fn(() => ({}))
    expect(() => fireToast(-1, { spawnFn })).toThrow()
    expect(() => fireToast(1.5, { spawnFn })).toThrow()
    expect(() => fireToast(Number.NaN, { spawnFn })).toThrow()
    // 文字列を数値偽装した攻撃も拒否（型上は number だが実行時に検証）。
    expect(() => fireToast("3; rm -rf /" as unknown as number, { spawnFn })).toThrow()
    expect(spawnFn).not.toHaveBeenCalled()
  })

  it("TS-03: -Count の値は独立した配列要素であり文字列連結されていない", () => {
    // 【テスト目的】件数が他の引数と連結されず単独要素で渡ること（P0）。
    const spawnFn = vi.fn(() => ({}))
    fireToast(42, { spawnFn })
    const [, args] = spawnFn.mock.calls[0] as [string, string[]]
    const idx = args.indexOf("-Count")
    expect(idx).toBeGreaterThanOrEqual(0)
    // -Count の直後の要素が件数（"42"）そのもので、連結された複合文字列でない。
    expect(args[idx + 1]).toBe("42")
    // どの引数にも件数を埋め込んだ複合文字列が無い（例: "-Count 42"）。
    expect(args.some((a) => a.includes("-Count 42"))).toBe(false)
  })

  it("TS-04: N=0 は有効として spawn 起動", () => {
    // 【テスト目的】0 件は有効値（負・小数のみ拒否）。
    const spawnFn = vi.fn(() => ({}))
    fireToast(0, { spawnFn })
    const [, args] = spawnFn.mock.calls[0] as [string, string[]]
    expect(args).toContain("0")
  })
})
