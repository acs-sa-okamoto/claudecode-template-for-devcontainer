// TASK-0016: ジョブ進捗取得ルート（GET /jobs/:jobId）
//
// 役割: 一括同期ジョブの進捗（SyncJob）を返す。存在しない jobId は NOT_FOUND。
// 進捗バー「X / N 件 登録中... 残り推定: M分」の元データ（REQ-011 / AC-10）。
//
// 依存注入: getJob（= SyncBatchRunner.getJob のラッパ）を受け取り、
// 実 MetaStore / 実ランナーを直接 import しない（非依存テストが可能）。
//
// セキュリティ（P0）:
// - 読み取り専用・localhost のみ到達（NFR-102）。本層で追加制御は不要。
// - 出力は JSON のみ（c.json でエスケープ）。エラーメッセージは日本語固定文言。

import { Hono } from "hono"
import { ERROR_CODES, err, ok, type SyncJob } from "../../shared/index.js"

/** ジョブ取得ルートの依存（注入）。 */
export interface JobsRouterDeps {
  /** jobId からジョブ進捗を返す。未知 jobId は null。 */
  getJob: (jobId: string) => SyncJob | null
}

/** ユーザ向けメッセージ（日本語・内部情報なし NFR-201）。 */
const MSG_NOT_FOUND = "指定されたジョブが見つかりません"

/**
 * ジョブ取得ルータを生成する。
 * createApp 側で `app.route("/api/jobs", createJobsRouter(deps))` でマウントする。
 */
export function createJobsRouter(deps: JobsRouterDeps): Hono {
  const router = new Hono()

  router.get("/:jobId", (c) => {
    const jobId = c.req.param("jobId")
    const job = deps.getJob(jobId)
    if (!job) {
      return c.json(err(ERROR_CODES.NOT_FOUND, MSG_NOT_FOUND), 404)
    }
    return c.json(ok(job))
  })

  return router
}
