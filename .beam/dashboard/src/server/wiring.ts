// 本番起動の最終結線（TASK-0026 / Phase 6）。
//
// code-map の「本番起動の配線」申し送りを実装する。実 TaskReader / MetaStore /
// NotionClient / SyncBatchRunner / Notifier を生成し、createApp(deps) へ注入する
// 形に組み立てる。runner / notifier / sseHub はアプリ寿命で 1 インスタンス（in-memory
// 状態を保持）。
//
// E2E（TASK-0026）はこの結線を実サービスで使いつつ、外部依存だけを差し替える:
//   - Notion: NotionClient の fetch/sleep を注入してスタブ化（実 API 非通信）。
//   - powershell.exe: Notifier の fireToast を注入してスタブ化（実プロセス非起動）。
// これにより「本番と同じ結線・本物のロジック」で E2E を回せる（EDGE-005）。
//
// セキュリティ（P0）:
//   - サーバは 127.0.0.1 バインドのみ（NFR-102）。startServer がホスト名を固定。
//   - Notion トークンは AppConfig 経由でのみ NotionClient へ渡す（直書き・ログ出力しない）。
//   - フロント→DB 直結なし（すべて API 経由）。

import type { Database } from "better-sqlite3"
import type { AppConfig } from "./config/env.js"
import { initAppDb } from "./db/appDb.js"
import type { AppLogger } from "./logger/index.js"
import { logger as sharedLogger } from "./logger/index.js"
import { MetaStore } from "./services/meta-store.js"
import {
  NotionClient,
  type NotionFetch,
  type SleepFn,
} from "./services/notion-client.js"
import { Notifier } from "./services/notifier/notifier.js"
import { SyncBatchRunner } from "./services/sync-batch.js"
import { syncDelete } from "./services/sync-delete.js"
import { syncOne } from "./services/sync-one.js"
import { TaskReader } from "./services/task-reader.js"
import { mergeTasks } from "./services/task-merger.js"
import { createApp, type AppBundle, type CreateAppDeps } from "./index.js"

/** buildAppBundle の依存。テストは外部依存（Notion fetch/sleep・toast spawn/fire）を差し替える。 */
export interface WiringDeps {
  /** 検証済みアプリ構成（PORT/各種パス/Notion 資格情報）。 */
  config: AppConfig
  /** 既存の app.db 接続を渡す場合（テストで一時 DB を使う）。未指定なら initAppDb。 */
  db?: Database
  /** Notion API の fetch（既定 globalThis.fetch。テストでスタブ）。 */
  notionFetch?: NotionFetch
  /** Notion リトライ用 sleep（既定 setTimeout。テストで即時化）。 */
  notionSleep?: SleepFn
  /** トースト発火（既定 toast.fireToast = powershell.exe 起動。テストで記録のみのスタブ）。 */
  fireToast?: (count: number) => void
  /** 一括同期のスロットリング（既定 350ms。テストで 0 など短縮可能）。 */
  throttleMs?: number
  /** ロガー（既定 共有 logger）。 */
  logger?: AppLogger
}

/** buildAppBundle の戻り値（後始末用に生成物の参照を返す）。 */
export interface WiredBundle extends AppBundle {
  /** メタ DB 接続（呼び出し側が close する）。 */
  db: Database
  /** ソース DB リーダ（呼び出し側が close する）。 */
  reader: TaskReader
  /** 一括同期ランナー（アプリ寿命で 1 インスタンス）。 */
  runner: SyncBatchRunner
  /** 通知集約器（アプリ寿命で 1 インスタンス）。 */
  notifier: Notifier
}

/**
 * 実サービスを生成し createApp に注入した AppBundle を組み立てる。
 *
 * code-map の配線指針どおり:
 *   tasks:         { listTasks: () => mergeTasks(reader, store) }
 *   sync:          { syncOne, syncDelete, runner }
 *   jobs:          { getJob: (id) => runner.getJob(id) }
 *   hook:          { store, notifier }（sseHub は共有）
 *   notifications: { store }
 */
export function buildAppBundle(deps: WiringDeps): WiredBundle {
  const log = deps.logger ?? sharedLogger
  const { config } = deps

  // データアクセス層。
  const db = deps.db ?? initAppDb(config)
  const store = new MetaStore(db)
  const reader = new TaskReader(config.SOURCE_DB_PATH)

  // Notion クライアント（fetch/sleep はテストで差し替え＝実 API 非通信）。
  const notion = new NotionClient({
    token: config.NOTION_API_TOKEN,
    parentPageId: config.NOTION_PARENT_PAGE_ID,
    fetch: deps.notionFetch,
    sleep: deps.notionSleep,
  })

  // 同期オーケストレーション関数（注入済みサービスを部分適用）。
  const syncOneFn = (target: { project: string; taskId: string }) =>
    syncOne(target, { store, notion, lookup: reader, logger: log })
  const syncDeleteFn = (target: { project: string; taskId: string }) =>
    syncDelete(target, { store, notion, logger: log })

  // 一括同期ランナー（アプリ寿命で 1 インスタンス）。
  const runner = new SyncBatchRunner({
    store,
    syncOne: syncOneFn,
    syncDelete: syncDeleteFn,
    throttleMs: deps.throttleMs,
    logger: log,
  })

  // 通知集約。ホスト側トースト（方式A: powershell.exe + BurntToast）は廃止したため、
  // 既定の fireToast は no-op。実通知はブラウザ（方式B: Web Notifications）が担う。
  // テストは deps.fireToast を注入して発火を検証できる（互換維持）。
  const notifier = new Notifier({
    isEnabled: () => store.getNotificationsEnabled(),
    fireToast: deps.fireToast ?? (() => {}),
    logger: log,
  })

  const appDeps: CreateAppDeps = {
    mode: config.mode,
    tasks: { listTasks: () => mergeTasks(reader, store) },
    sync: { syncOne: syncOneFn, syncDelete: syncDeleteFn, runner },
    jobs: { getJob: (id: string) => runner.getJob(id) },
    // sseHub は createApp 共有インスタンスを使う（hook 側は省略時に共有を受け取る）。
    hook: { store, notifier },
    notifications: { store },
  }

  const bundle = createApp(appDeps)
  return { ...bundle, db, reader, runner, notifier }
}
