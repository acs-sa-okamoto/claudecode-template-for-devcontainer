// task-bridge サーバーエントリ（Hono 起動, 127.0.0.1:3939）
//
// TASK-0014: Hono アプリ基盤を拡張する。
// - GET /health: 死活確認（TASK-0001 から継続）
// - GET /api/events: SSE ストリーム（tasks_changed を push）
// - GET / ほか: Web UI 静的配信（Vite 成果物 dist/web）
//
// 後続タスク（TASK-0015〜0018）が createApp に各 API ルートを追加する。
//
// セキュリティ（P0）:
// - 127.0.0.1 バインドのみ（NFR-102 / REQ-406）。0.0.0.0 へはバインドしない。
// - CORS ミドルウェアを設定しない＝クロスオリジン許可ヘッダを返さない（同一オリジンのみ）。
// - 認証なし（個人利用・localhost 前提 REQ-407）。副作用 API は後続タスクで localhost 到達のみ。

import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { loadConfigFromProcess } from "./config/env.js"
import { logger } from "./logger/index.js"
import { createHookRouter, type HookRouterDeps } from "./routes/hook.js"
import { createJobsRouter, type JobsRouterDeps } from "./routes/jobs.js"
import {
  createNotificationsRouter,
  type NotificationsRouterDeps,
} from "./routes/notifications.js"
import { createSyncRouter, type SyncRouterDeps } from "./routes/sync.js"
import { createTasksRouter, type TasksRouterDeps } from "./routes/tasks.js"
import { registerStatic } from "./static.js"
import { SseHub } from "./sse.js"

/** createApp の依存（テストでフェイク注入可能）。 */
export interface CreateAppDeps {
  /**
   * 動作モード（"full" | "view"）。GET /api/config で UI に返す。
   * 省略時は "full"（通常運用）。
   */
  mode?: "full" | "view"
  /** SSE ハブ（未指定なら新規生成）。 */
  sseHub?: SseHub
  /** 静的配信ルート（未指定なら dist/web）。テストで無効化も可。 */
  staticRoot?: string
  /** 静的配信を登録するか（テスト時 false で無効化可能、既定 true）。 */
  enableStatic?: boolean
  /**
   * タスク一覧ルート（GET /api/tasks）の依存。
   * 指定時のみマウントする（本番起動時は配線済みの listTasks を渡す）。
   */
  tasks?: TasksRouterDeps
  /**
   * 同期系ルート（POST /api/tasks/:project/:taskId/sync ほか）の依存。
   * 指定時のみマウントする（本番起動時は syncOne/syncDelete/runner を配線して渡す）。
   */
  sync?: SyncRouterDeps
  /**
   * ジョブ取得ルート（GET /api/jobs/:jobId）の依存。
   * 指定時のみマウントする。
   */
  jobs?: JobsRouterDeps
  /**
   * hook 受信ルート（POST /api/hook）の依存。
   * 指定時のみマウントする（本番起動時は store/sseHub/notifier を配線して渡す）。
   * sseHub を省略時は createApp の共有 sseHub を使う。
   */
  hook?: Omit<HookRouterDeps, "sseHub"> & { sseHub?: HookRouterDeps["sseHub"] }
  /**
   * 通知設定ルート（GET/POST /api/notifications）の依存。
   * 指定時のみマウントする（本番起動時は MetaStore を配線して渡す）。
   */
  notifications?: NotificationsRouterDeps
}

/** createApp の戻り値（app と共有インスタンス）。 */
export interface AppBundle {
  app: Hono
  sseHub: SseHub
}

/**
 * Hono アプリを構築する。テスト・本番の双方からこの 1 関数を入口にする。
 * ルート定義順: API（/health, /api/*）→ 静的配信（/, /*）。
 * serveStatic は API ルートにマッチしないパスのみ拾う（API を食わない）。
 */
export function createApp(deps: CreateAppDeps = {}): AppBundle {
  const app = new Hono()
  const sseHub = deps.sseHub ?? new SseHub()

  // 死活確認（TASK-0001 から継続）。
  app.get("/health", (c) => c.json({ success: true, data: { status: "ok" } }))

  // クライアント設定（動作モード）。UI が view/full を判別してバッジ表示に使う。
  app.get("/api/config", (c) =>
    c.json({ success: true, data: { mode: deps.mode ?? "full" } }),
  )

  // SSE ストリーム。接続を SseHub に登録し、切断（abort）で除去する（REQ-010）。
  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      sseHub.add(stream)
      // クライアント切断時にハブから除去する（接続リーク防止）。
      c.req.raw.signal.addEventListener("abort", () => {
        sseHub.remove(stream)
      })
      // ストリームを開いたまま維持する。abort されるまで待機。
      await new Promise<void>((resolve) => {
        c.req.raw.signal.addEventListener("abort", () => resolve())
      })
    }),
  )

  // API ルート（指定された依存のみマウント）。静的配信より前に登録する。
  if (deps.tasks) {
    app.route("/api/tasks", createTasksRouter(deps.tasks))
  }
  // 同期系（POST /api/tasks/:project/:taskId/sync, /delete-sync, POST /api/projects/:project/sync）。
  // ベースは /api（ルータ内は /tasks/... と /projects/...）。GET /api/tasks（一覧）とは
  // メソッド・パスが異なるため衝突しない。
  if (deps.sync) {
    app.route("/api", createSyncRouter(deps.sync))
  }
  // ジョブ進捗（GET /api/jobs/:jobId）。
  if (deps.jobs) {
    app.route("/api/jobs", createJobsRouter(deps.jobs))
  }
  // hook 受信（POST /api/hook）。sseHub は createApp 共有インスタンスを既定で使う。
  if (deps.hook) {
    app.route(
      "/api/hook",
      createHookRouter({ ...deps.hook, sseHub: deps.hook.sseHub ?? sseHub }),
    )
  }
  // 通知設定（GET/POST /api/notifications）。
  if (deps.notifications) {
    app.route("/api/notifications", createNotificationsRouter(deps.notifications))
  }

  // 静的配信（Web UI）。API ルートの後に登録する（REQ-013）。
  if (deps.enableStatic !== false) {
    registerStatic(app, { root: deps.staticRoot })
  }

  return { app, sseHub }
}

/** startServer の依存（テストで serve を注入してバインド設定を検証可能）。 */
export interface StartServerOptions {
  port: number
  app?: Hono
  /** @hono/node-server の serve（既定は実 serve）。 */
  serve?: typeof serve
  /** 起動完了コールバック（既定はログ出力）。 */
  onListen?: (port: number) => void
}

/**
 * サーバを 127.0.0.1 にバインドして起動する（NFR-102 / P0）。
 * hostname は固定文字列 "127.0.0.1"。0.0.0.0 は使わない。
 */
export function startServer(options: StartServerOptions): void {
  const serveFn = options.serve ?? serve
  const app = options.app ?? createApp().app
  const onListen =
    options.onListen ?? ((port: number) => logger.logStartup(port))

  serveFn(
    { fetch: app.fetch, hostname: "127.0.0.1", port: options.port },
    (info) => onListen(info.port),
  )
}

// アプリの共有インスタンス（後続タスクの結線・テスト互換のため export）。
const { app } = createApp()

// エントリとして直接実行されたときのみ起動する。
// （テスト等から import される場合は副作用で起動しないようにする）
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  // 本番起動の最終結線（Phase 6 / TASK-0026）: 実サービスを生成し createApp に注入する。
  // wiring を動的 import するのは循環依存（wiring → index.createApp）を解くため。
  //
  // 【重要】ここで **トップレベル await を使わない**。index は wiring から静的 import される
  // （createApp）ため、index がトップレベル await で wiring を待つと「index↔wiring」が相互に
  // 完了待ちになり、ESM のトップレベル await がデッドロックして listen 前にプロセスが終了する
  // （`node dist/server/index.js` で再現）。async IIFE にすると index モジュールの評価は
  // 同期的に完了し、wiring の静的 import が解決 → IIFE 内の await import が解決して起動できる。
  void (async () => {
    try {
      // 起動時に env を検証する（必須欠落なら明示エラーで停止、TASK-0002）。
      const config = loadConfigFromProcess()
      const { buildAppBundle } = await import("./wiring.js")
      const bundle = buildAppBundle({ config })
      startServer({ port: config.PORT, app: bundle.app })
    } catch (e) {
      // env 欠落など起動時エラーは明示して非ゼロ終了する。
      const message = e instanceof Error ? e.message : String(e)
      process.stderr.write(`起動に失敗しました: ${message}\n`)
      process.exit(1)
    }
  })()
}

export { app }
