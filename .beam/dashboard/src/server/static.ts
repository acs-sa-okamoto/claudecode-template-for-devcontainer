// TASK-0014: Web UI の静的配信（GET / と静的アセット）
//
// REQ-013: Web UI（静的 HTML/JS）を配信する。Vite ビルド成果物（dist/web）を
// 既定ルートとし、`GET /` で index.html を返す。
//
// セキュリティ: serveStatic は root 配下のファイルのみを配信する（パストラバーサルは
// @hono/node-server 側で正規化・防御される）。CORS ヘッダは付与しない（同一オリジン）。

import { serveStatic } from "@hono/node-server/serve-static"
import type { Hono } from "hono"

/** 静的配信の設定。 */
export interface StaticOptions {
  /** 配信ルート（Vite 成果物。既定 dist/web）。 */
  root?: string
}

/** ビルド成果物の既定配信ルート（vite build の出力先）。 */
export const DEFAULT_STATIC_ROOT = "./dist/web"

/**
 * 静的配信ルートを app に登録する。
 * - `GET /` → index.html
 * - その他のパス → root 配下の対応ファイル（存在しなければ後続ハンドラ/404）
 *
 * 注意: API ルート（/api/*, /health）は本登録より前に定義しておくこと。
 * serveStatic は該当ファイルが無ければ next() するため API を食わない。
 */
export function registerStatic(app: Hono, options: StaticOptions = {}): void {
  const root = options.root ?? DEFAULT_STATIC_ROOT

  // ルートは index.html を返す（SPA ではないが UI のエントリ HTML）。
  app.get("/", serveStatic({ root, path: "index.html" }))
  // 残りのパスは root 配下のファイルへフォールバック配信する。
  app.get("/*", serveStatic({ root }))
}
