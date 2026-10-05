// 一括同期オーケストレーション SyncBatchRunner（TASK-0011）。
//
// 設計契約: api-endpoints.md（POST /api/projects/:project/sync, GET /api/jobs/:jobId）/
// requirements.md（REQ-005/011/204/110, EDGE-005, NFR-005）/ dataflow.md。
//
// フロー:
//   1. 対象抽出: listTaskMetaByProject から not_synced/sync_failed を同期対象、pending_deletion を削除対象に。
//      total = 同期対象 + 削除対象。createSyncJob で sync_job を作成し jobId を即時返却（REQ-204）。
//   2. バックグラウンド（queueMicrotask）で逐次処理。各件で syncOne / syncDelete を呼び、
//      各件後に sleep(THROTTLE_MS) を挟んで Notion の 429 を回避する（REQ-110）。
//   3. 各件後に done/failed と etaSeconds を更新（REQ-110/AC-10）。一部失敗でも継続（EDGE-005）。
//   4. 各件処理前に経過時間（now()-startedAt）が 30 分を超えたら残処理を打ち切り status='timeout'
//      （NFR-005）。全件完了で status='completed'。
//
// 設計判断:
// - syncOne / syncDelete は注入（TASK-0010 / TASK-0012 の関数を結線）。本クラスはオーケストレーション
//   のみを担う（重複実装を避ける）。
// - sleep / now / genJobId を注入し、実時間に依存せずタイムアウト・スロットリングをテストできる。
// - sync_job スキーマに eta_seconds 列が無いため etaSeconds はインメモリ算出し getJob で合成する
//   （永続化はしない）。MetaStore.getSyncJob は etaSeconds=null を返すため、それに上書きする。
//
// セキュリティ（P0）:
// - DB アクセスは MetaStore（Prepared Statement）経由のみ。生 SQL を組まない。
// - ログにトークン・PII を出さない（件数・jobId・project のみ）。

import type { SyncJob, SyncResult } from "../../shared/index.js"
import type { AppLogger } from "../logger/index.js"
import { logger as sharedLogger } from "../logger/index.js"
import type { MetaStore } from "./meta-store.js"
import type { DeleteSyncResult } from "./sync-delete.js"

/** スロットリング間隔（ミリ秒）。429 回避目的（設定値）。 */
export const DEFAULT_THROTTLE_MS = 350
/** ジョブのタイムアウト（30 分）。NFR-005。 */
export const JOB_TIMEOUT_MS = 30 * 60 * 1000

/** 同期 1 件分の関数（TASK-0010 syncOne 互換）。 */
export type SyncOneFn = (target: {
  project: string
  taskId: string
}) => Promise<SyncResult>

/** 削除 1 件分の関数（TASK-0012 syncDelete 互換）。 */
export type SyncDeleteFn = (target: {
  project: string
  taskId: string
}) => Promise<DeleteSyncResult>

/** SyncBatchRunner の依存（注入）。 */
export interface SyncBatchDeps {
  store: MetaStore
  syncOne: SyncOneFn
  syncDelete: SyncDeleteFn
  /** スロットリング待機（既定 setTimeout ベース）。テストで無効化。 */
  sleep?: (ms: number) => Promise<void>
  /** 現在時刻（既定 Date.now）。タイムアウト判定に使用。 */
  now?: () => number
  /** jobId 生成（既定 ランダム）。 */
  genJobId?: () => string
  /** スロットリング間隔（既定 DEFAULT_THROTTLE_MS）。 */
  throttleMs?: number
  logger?: AppLogger
}

/** 1 件の処理単位（同期 or 削除）。 */
interface WorkItem {
  taskId: string
  kind: "sync" | "delete"
}

/** ジョブの実行中ランタイム状態（インメモリ）。 */
interface JobRuntime {
  startedAt: number
  etaSeconds: number | null
  done: () => Promise<void>
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** ランダム jobId（衝突可能性は個人利用規模で無視できる）。 */
const realGenJobId = (): string =>
  `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

/**
 * プロジェクト一括同期のオーケストレーター。
 * start() でジョブを即時返却し、バックグラウンドで逐次処理する。
 */
export class SyncBatchRunner {
  private readonly store: MetaStore
  private readonly syncOne: SyncOneFn
  private readonly syncDelete: SyncDeleteFn
  private readonly sleep: (ms: number) => Promise<void>
  private readonly now: () => number
  private readonly genJobId: () => string
  private readonly throttleMs: number
  private readonly log: AppLogger
  /** jobId → ランタイム状態（etaSeconds・完了待ち promise）。 */
  private readonly runtimes = new Map<string, JobRuntime>()

  constructor(deps: SyncBatchDeps) {
    this.store = deps.store
    this.syncOne = deps.syncOne
    this.syncDelete = deps.syncDelete
    this.sleep = deps.sleep ?? realSleep
    this.now = deps.now ?? (() => Date.now())
    this.genJobId = deps.genJobId ?? realGenJobId
    this.throttleMs = deps.throttleMs ?? DEFAULT_THROTTLE_MS
    this.log = deps.logger ?? sharedLogger
  }

  /**
   * 一括同期ジョブを開始する。sync_job を生成して即時に SyncJob を返し、
   * バックグラウンドで逐次処理を起動する（処理完了を待たない REQ-204）。
   */
  start(project: string): SyncJob {
    const items = this.collectWorkItems(project)
    const jobId = this.genJobId()
    const startedAt = this.now()
    this.store.createSyncJob(jobId, project, items.length)

    // バックグラウンド処理を起動し、完了待ち promise を保持する（テスト・診断用）。
    const promise = this.runBatch(jobId, project, items, startedAt)
    this.runtimes.set(jobId, {
      startedAt,
      etaSeconds: null,
      done: () => promise,
    })

    return {
      jobId,
      project,
      total: items.length,
      done: 0,
      failed: 0,
      status: "running",
      etaSeconds: null,
      startedAt: new Date(startedAt).toISOString(),
    }
  }

  /** バックグラウンド処理の完了を待つ（テスト用。本番では呼ばなくてよい）。 */
  async whenIdle(jobId: string): Promise<void> {
    await this.runtimes.get(jobId)?.done()
  }

  /**
   * ジョブの現況を返す（永続値 + インメモリ etaSeconds を合成）。
   * GET /api/jobs/:jobId（TASK-0016）が利用する。
   */
  getJob(jobId: string): SyncJob | null {
    const persisted = this.store.getSyncJob(jobId)
    if (!persisted) return null
    const rt = this.runtimes.get(jobId)
    return { ...persisted, etaSeconds: rt?.etaSeconds ?? persisted.etaSeconds }
  }

  /** 対象（not_synced / sync_failed=同期 / pending_deletion=削除）を抽出する。 */
  private collectWorkItems(project: string): WorkItem[] {
    const metas = this.store.listTaskMetaByProject(project)
    const items: WorkItem[] = []
    for (const m of metas) {
      // not_synced / sync_failed（再試行 REQ-203）に加え、synced かつ update_badge
      //（＝同期後にソースが変化）も再同期対象に含める。syncOne 側が新規作成と
      // 既存ページ更新を判定するため、ここでは一律 kind="sync" とする。
      if (
        m.notionSyncStatus === "not_synced" ||
        m.notionSyncStatus === "sync_failed" ||
        (m.notionSyncStatus === "synced" && m.updateBadge)
      ) {
        items.push({ taskId: m.taskId, kind: "sync" })
      } else if (m.notionSyncStatus === "pending_deletion") {
        items.push({ taskId: m.taskId, kind: "delete" })
      }
    }
    return items
  }

  /**
   * 逐次処理本体。各件処理前にタイムアウト判定、各件後にスロットリングと進捗更新を行う。
   */
  private async runBatch(
    jobId: string,
    project: string,
    items: WorkItem[],
    startedAt: number,
  ): Promise<void> {
    let done = 0
    let failed = 0
    const total = items.length

    for (const item of items) {
      // タイムアウト判定（NFR-005）: 経過時間が 30 分を超えたら残処理を打ち切る。
      if (this.now() - startedAt > JOB_TIMEOUT_MS) {
        this.store.updateSyncJob(jobId, { status: "timeout" })
        this.log.info({ event: "sync_batch", jobId, project, status: "timeout" })
        return
      }

      const succeeded = await this.processItem(project, item)
      if (succeeded) done += 1
      else failed += 1

      // 進捗更新 + etaSeconds 算出（残件数 × 平均処理時間秒）。
      this.store.updateSyncJob(jobId, { done, failed })
      this.updateEta(jobId, startedAt, done + failed, total)

      // スロットリング（429 回避）。最終件の後も挟んでよい（待機は注入で無効化可能）。
      await this.sleep(this.throttleMs)
    }

    this.store.updateSyncJob(jobId, { status: "completed" })
    // 完了時は残 0 のため eta=0。
    const rt = this.runtimes.get(jobId)
    if (rt) rt.etaSeconds = 0
    this.log.info({ event: "sync_batch", jobId, project, status: "completed", done, failed })
  }

  /** 1 件を処理する。成功なら true。例外は失敗扱いで握る（全体継続 EDGE-005）。 */
  private async processItem(project: string, item: WorkItem): Promise<boolean> {
    try {
      if (item.kind === "delete") {
        const r = await this.syncDelete({ project, taskId: item.taskId })
        return r.status === "deleted"
      }
      const r = await this.syncOne({ project, taskId: item.taskId })
      return r.status === "synced"
    } catch {
      // syncOne/syncDelete は通常自前で例外を握るが、保険として失敗扱いにする。
      return false
    }
  }

  /** etaSeconds を算出してランタイムに保存する。残 0 なら 0、進捗 0 なら null。 */
  private updateEta(
    jobId: string,
    startedAt: number,
    processed: number,
    total: number,
  ): void {
    const rt = this.runtimes.get(jobId)
    if (!rt) return
    const remaining = total - processed
    if (remaining <= 0) {
      rt.etaSeconds = 0
      return
    }
    if (processed <= 0) {
      rt.etaSeconds = null
      return
    }
    const elapsedMs = this.now() - startedAt
    const avgMsPerItem = elapsedMs / processed
    rt.etaSeconds = Math.round((remaining * avgMsPerItem) / 1000)
  }
}
