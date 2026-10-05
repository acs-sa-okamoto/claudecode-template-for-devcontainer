// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { ApiError } from "../api/client.js"
import { DB_ERROR_MESSAGE, showErrorScreen } from "./dbError.js"

describe("showErrorScreen", () => {
  it("TC-01/TC-03: DB_CONNECTION_FAILED で日本語エラー画面を表示し例外で停止しない", () => {
    // 【テスト目的】DB 接続エラーで画面表示・継続（REQ-112/AC-20/NFR-303）
    // 【テスト内容】ApiError(DB_CONNECTION_FAILED) を渡す
    // 【期待される動作】固定日本語メッセージが表示される
    const container = document.createElement("div")
    expect(() =>
      showErrorScreen(container, new ApiError("DB_CONNECTION_FAILED", "x")),
    ).not.toThrow()
    const screen = container.querySelector('[data-testid="error-screen"]')
    expect(screen?.textContent).toBe(DB_ERROR_MESSAGE)
  })

  it("TC-04: エラー画面は role=alert を持つ", () => {
    const container = document.createElement("div")
    showErrorScreen(container, new ApiError("DB_CONNECTION_FAILED", "x"))
    const screen = container.querySelector('[data-testid="error-screen"]')
    expect(screen?.getAttribute("role")).toBe("alert")
  })

  it("メッセージが日本語である（NFR-201）", () => {
    // 日本語（ひらがな/カタカナ/漢字）を含むことを確認
    expect(/[ぁ-んァ-ン一-龯]/.test(DB_ERROR_MESSAGE)).toBe(true)
  })
})
