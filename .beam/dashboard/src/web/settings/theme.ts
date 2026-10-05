// テーマ切替（ライト/ダーク）。localStorage 永続化・即時 DOM 反映（REQ-301 / NFR-203）。
//
// テーマはサーバではなくブラウザ localStorage に保持する（プロジェクト方針）。
// CSS 変数の切替は <html data-theme="light|dark"> で行う（styles.css）。

import type { Theme } from "../../shared/index.js"
import { el } from "../dom.js"

/** localStorage のキー。 */
export const THEME_STORAGE_KEY = "theme"
/** 既定テーマ。 */
export const DEFAULT_THEME: Theme = "light"

/** Theme として妥当か判定する（不正値フォールバック用）。 */
function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark"
}

/**
 * テーマを即時 DOM 反映し localStorage に保存する（NFR-203 / AC-17）。
 */
export function applyTheme(
  theme: Theme,
  storage: Storage = localStorage,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = theme
  try {
    storage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // localStorage 利用不可（プライベートモード等）でも DOM 反映は継続する。
  }
}

/** localStorage から現在テーマを読む。無効/不在は既定（light）。 */
export function loadTheme(storage: Storage = localStorage): Theme {
  let value: string | null = null
  try {
    value = storage.getItem(THEME_STORAGE_KEY)
  } catch {
    value = null
  }
  return isTheme(value) ? value : DEFAULT_THEME
}

/** 保存済みテーマを読み込んで適用する（起動時 AC-17）。適用したテーマを返す。 */
export function initTheme(
  storage: Storage = localStorage,
  root: HTMLElement = document.documentElement,
): Theme {
  const theme = loadTheme(storage)
  applyTheme(theme, storage, root)
  return theme
}

/** 現在テーマを反転して適用し、新テーマを返す。 */
export function toggleTheme(
  storage: Storage = localStorage,
  root: HTMLElement = document.documentElement,
): Theme {
  const next: Theme = loadTheme(storage) === "dark" ? "light" : "dark"
  applyTheme(next, storage, root)
  return next
}

/** テーマ切替ボタンを生成する。クリックで toggleTheme し、ラベルを更新する。 */
export function createThemeToggleButton(
  storage: Storage = localStorage,
  root: HTMLElement = document.documentElement,
): HTMLButtonElement {
  const labelFor = (t: Theme): string =>
    t === "dark" ? "ライトモードへ" : "ダークモードへ"
  const button = el("button", {
    className: "theme-toggle",
    text: labelFor(loadTheme(storage)),
    attrs: { type: "button", "data-testid": "theme-toggle" },
  })
  button.addEventListener("click", () => {
    const next = toggleTheme(storage, root)
    button.textContent = labelFor(next)
  })
  return button
}
