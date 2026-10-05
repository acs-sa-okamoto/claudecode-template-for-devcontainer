// DB 接続エラー画面（REQ-112 / AC-20 / NFR-303）。
//
// API が DB_CONNECTION_FAILED を返した場合に日本語のエラー画面を表示し、
// アプリは停止させず継続する。再描画（再取得成功）でクリアされる。
//
// XSS（P0）: 表示文言は固定日本語テンプレート。サーバ由来 message は信頼境界外の
// ため、補足表示する場合も textContent で挿入する。

import type { ApiError } from "../api/client.js"
import { clear, el } from "../dom.js"

/** DB 接続エラー時の固定メッセージ（NFR-201）。 */
export const DB_ERROR_MESSAGE = "DBに接続できません。ファイルを確認してください。"

/** エラー画面のコンテナ id。 */
export const ERROR_SCREEN_ID = "error-screen"

/**
 * エラー画面を表示する。code=DB_CONNECTION_FAILED 以外も汎用エラーとして表示する。
 * 既存内容をクリアして role="alert" のエラー領域を挿入する（アプリは継続）。
 */
export function showErrorScreen(container: Element, error: ApiError): void {
  clear(container)
  const message =
    error.code === "DB_CONNECTION_FAILED"
      ? DB_ERROR_MESSAGE
      : "エラーが発生しました。"
  const screen = el("div", {
    className: "error-screen",
    attrs: {
      id: ERROR_SCREEN_ID,
      role: "alert",
      "aria-live": "assertive",
      "data-testid": "error-screen",
    },
    children: [el("p", { className: "error-message", text: message })],
  })
  container.appendChild(screen)
}
