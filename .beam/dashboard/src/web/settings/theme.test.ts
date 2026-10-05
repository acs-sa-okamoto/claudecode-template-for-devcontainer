// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import {
  applyTheme,
  DEFAULT_THEME,
  initTheme,
  loadTheme,
  THEME_STORAGE_KEY,
  toggleTheme,
} from "./theme.js"

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  it("TC-03: applyTheme が即時 DOM 反映＆localStorage 保存する", () => {
    // 【テスト目的】テーマ切替の即時反映と永続化（NFR-203/AC-17）
    applyTheme("dark")
    expect(document.documentElement.dataset.theme).toBe("dark")
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark")
  })

  it("TC-04: initTheme が localStorage の保存値を適用する", () => {
    // 【テスト目的】起動時に保存テーマを復元（AC-17）
    localStorage.setItem(THEME_STORAGE_KEY, "dark")
    const applied = initTheme()
    expect(applied).toBe("dark")
    expect(document.documentElement.dataset.theme).toBe("dark")
  })

  it("TC-E02: 不正値は既定（light）にフォールバック", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "rainbow")
    expect(loadTheme()).toBe(DEFAULT_THEME)
  })

  it("toggleTheme は light/dark を反転する", () => {
    applyTheme("light")
    expect(toggleTheme()).toBe("dark")
    expect(toggleTheme()).toBe("light")
  })
})
