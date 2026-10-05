// MetaStore: アプリメタ DB（data/app.db）への読み書きを担うサービス（TASK-0007）。
//
// 設計契約: docs/spec/task-bridge/design/database-schema.sql（task_meta / settings /
// notion_project / sync_job）/ interfaces.ts（TaskMeta / DeletedSnapshot / AppSettings /
// NotionProject / SyncJob）。
//
// セキュリティ（P0）:
// - すべてのクエリを Prepared Statement（パラメータ化クエリ）で実装し、値はプレースホルダ
//   バインドする。動的な識別子結合は行わない（テーブル名は固定）。
// - 本サービスはトークン等のシークレットを扱わない（ログ漏えいの余地なし）。
//
// 設計判断: DB 接続の生成は src/server/db/appDb.ts に一元化する規約に従い、本クラスは
// 開かれた接続（better-sqlite3 Database）を注入で受け取る（責務分離・テスト容易性）。

import type Database from "better-sqlite3"
import type {
  DeletedSnapshot,
  NotionProject,
  NotionSyncStatus,
  SyncJob,
  TaskMeta,
} from "../../shared/index.js"

/** settings テーブルの通知 ON/OFF キー。 */
const SETTING_NOTIFICATIONS_ENABLED = "notifications_enabled"

/** task_meta の生行（DB の列名・0/1 表現そのまま）。 */
interface TaskMetaRow {
  project: string
  task_id: string
  notion_sync_status: string
  notion_page_id: string | null
  update_badge: number
  is_deleted: number
  snap_title: string | null
  snap_content: string | null
  snap_status: string | null
  snap_created_at: string | null
  snap_updated_at: string | null
  last_error: string | null
  meta_updated_at: string
}

interface NotionProjectRow {
  project: string
  notion_database_id: string
  created_at: string
}

interface SyncJobRow {
  job_id: string
  project: string
  total: number
  done: number
  failed: number
  status: string
  started_at: string
}

/** sync_job の更新可能フィールド。 */
export interface SyncJobUpdate {
  done?: number
  failed?: number
  status?: SyncJob["status"]
}

/**
 * アプリメタ DB の CRUD を提供する。接続は appDb.openAppDb / initAppDb で生成して注入する。
 */
export class MetaStore {
  constructor(private readonly db: Database.Database) {}

  // ========================================
  // task_meta
  // ========================================

  /**
   * task_meta を upsert する（INSERT ... ON CONFLICT(project, task_id) DO UPDATE）。
   * スナップショットは TaskMeta.deletedSnapshot から snap_* 列へ展開する。
   */
  upsertTaskMeta(meta: TaskMeta): void {
    const snap = meta.deletedSnapshot
    this.db
      .prepare(
        `INSERT INTO task_meta (
           project, task_id, notion_sync_status, notion_page_id,
           update_badge, is_deleted,
           snap_title, snap_content, snap_status, snap_created_at, snap_updated_at,
           last_error, meta_updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(project, task_id) DO UPDATE SET
           notion_sync_status = excluded.notion_sync_status,
           notion_page_id     = excluded.notion_page_id,
           update_badge       = excluded.update_badge,
           is_deleted         = excluded.is_deleted,
           snap_title         = excluded.snap_title,
           snap_content       = excluded.snap_content,
           snap_status        = excluded.snap_status,
           snap_created_at    = excluded.snap_created_at,
           snap_updated_at    = excluded.snap_updated_at,
           last_error         = excluded.last_error,
           meta_updated_at    = excluded.meta_updated_at`,
      )
      .run(
        meta.project,
        meta.taskId,
        meta.notionSyncStatus,
        meta.notionPageId,
        meta.updateBadge ? 1 : 0,
        meta.isDeleted ? 1 : 0,
        snap?.title ?? null,
        snap?.content ?? null,
        snap?.status ?? null,
        snap?.createdAt ?? null,
        snap?.updatedAt ?? null,
        meta.lastError,
        meta.metaUpdatedAt,
      )
  }

  /** 単一 task_meta を取得する。未登録なら null。 */
  getTaskMeta(project: string, taskId: string): TaskMeta | null {
    const row = this.db
      .prepare(
        "SELECT * FROM task_meta WHERE project = ? AND task_id = ?",
      )
      .get(project, taskId) as TaskMetaRow | undefined
    return row ? this.mapTaskMeta(row) : null
  }

  /** 全 task_meta を取得する（project, task_id 昇順）。 */
  listTaskMeta(): TaskMeta[] {
    const rows = this.db
      .prepare("SELECT * FROM task_meta ORDER BY project ASC, task_id ASC")
      .all() as TaskMetaRow[]
    return rows.map((r) => this.mapTaskMeta(r))
  }

  /** 指定プロジェクトの task_meta を取得する（task_id 昇順）。 */
  listTaskMetaByProject(project: string): TaskMeta[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM task_meta WHERE project = ? ORDER BY task_id ASC",
      )
      .all(project) as TaskMetaRow[]
    return rows.map((r) => this.mapTaskMeta(r))
  }

  /**
   * 楽観ロック: 同期開始の排他取得。
   * not_synced / sync_failed のときのみ syncing に遷移させ、更新行数（changes）が 1 のとき
   * true を返す。0 のときは他処理が先行取得済みとみなし二重登録を防ぐ（EDGE-202、TOCTOU 回避）。
   */
  tryAcquireSyncLock(project: string, taskId: string): boolean {
    const info = this.db
      .prepare(
        `UPDATE task_meta
         SET notion_sync_status = 'syncing',
             meta_updated_at = datetime('now')
         WHERE project = ? AND task_id = ?
           AND notion_sync_status IN ('not_synced', 'sync_failed')`,
      )
      .run(project, taskId)
    return info.changes === 1
  }

  /**
   * synced へ遷移し、notion_page_id を保存、last_error をクリアする。
   * snapshot を渡すと「同期済み時点のソース状態」を snap_* に保存し update_badge を 0 にする。
   * mergeTasks はこの snapshot とライブソースの差分から「更新あり」を算出するため、
   * 同期成功時には必ず snapshot を渡すこと（差分追跡の基準点）。
   */
  markSynced(
    project: string,
    taskId: string,
    notionPageId: string,
    snapshot?: DeletedSnapshot,
  ): void {
    if (snapshot) {
      this.db
        .prepare(
          `UPDATE task_meta
           SET notion_sync_status = 'synced',
               notion_page_id = ?,
               last_error = NULL,
               update_badge = 0,
               snap_title = ?, snap_content = ?, snap_status = ?,
               snap_created_at = ?, snap_updated_at = ?,
               meta_updated_at = datetime('now')
           WHERE project = ? AND task_id = ?`,
        )
        .run(
          notionPageId,
          snapshot.title,
          snapshot.content,
          snapshot.status,
          snapshot.createdAt,
          snapshot.updatedAt,
          project,
          taskId,
        )
      return
    }
    this.db
      .prepare(
        `UPDATE task_meta
         SET notion_sync_status = 'synced',
             notion_page_id = ?,
             last_error = NULL,
             meta_updated_at = datetime('now')
         WHERE project = ? AND task_id = ?`,
      )
      .run(notionPageId, project, taskId)
  }

  /**
   * 再同期用の楽観ロック: synced のときのみ syncing に遷移させ、changes===1 で true。
   * 同期済みタスクの変更を既存ページへ反映する syncOne の再同期経路で使う（二重実行防止）。
   */
  tryAcquireResyncLock(project: string, taskId: string): boolean {
    const info = this.db
      .prepare(
        `UPDATE task_meta
         SET notion_sync_status = 'syncing',
             meta_updated_at = datetime('now')
         WHERE project = ? AND task_id = ?
           AND notion_sync_status = 'synced'`,
      )
      .run(project, taskId)
    return info.changes === 1
  }

  /**
   * update_badge を指定値に設定する（mergeTasks が差分計算結果を materialize するため）。
   * 既存行のみ対象（行は mergeTasks が事前に upsert 済み）。
   */
  setUpdateBadgeValue(project: string, taskId: string, value: boolean): void {
    this.db
      .prepare(
        "UPDATE task_meta SET update_badge = ? WHERE project = ? AND task_id = ?",
      )
      .run(value ? 1 : 0, project, taskId)
  }

  /** sync_failed へ遷移し、エラー理由（識別用、機密でない短文）を保存する。 */
  markSyncFailed(project: string, taskId: string, error: string): void {
    this.db
      .prepare(
        `UPDATE task_meta
         SET notion_sync_status = 'sync_failed',
             last_error = ?,
             meta_updated_at = datetime('now')
         WHERE project = ? AND task_id = ?`,
      )
      .run(error, project, taskId)
  }

  /** notion_page_id のみを設定する。 */
  setNotionPageId(project: string, taskId: string, notionPageId: string): void {
    this.db
      .prepare(
        `UPDATE task_meta
         SET notion_page_id = ?, meta_updated_at = datetime('now')
         WHERE project = ? AND task_id = ?`,
      )
      .run(notionPageId, project, taskId)
  }

  /**
   * 削除スナップショットを保存する。is_deleted=1・pending_deletion を設定し、
   * 取り消し線表示／復元の元データ（snap_*）を保持する（REQ-105）。
   */
  saveDeletedSnapshot(
    project: string,
    taskId: string,
    snapshot: DeletedSnapshot,
  ): void {
    this.db
      .prepare(
        `UPDATE task_meta
         SET is_deleted = 1,
             notion_sync_status = 'pending_deletion',
             snap_title = ?, snap_content = ?, snap_status = ?,
             snap_created_at = ?, snap_updated_at = ?,
             meta_updated_at = datetime('now')
         WHERE project = ? AND task_id = ?`,
      )
      .run(
        snapshot.title,
        snapshot.content,
        snapshot.status,
        snapshot.createdAt,
        snapshot.updatedAt,
        project,
        taskId,
      )
  }

  /** task_meta を物理削除する（未連携削除の即時消去 REQ-107）。 */
  deleteTaskMeta(project: string, taskId: string): void {
    this.db
      .prepare("DELETE FROM task_meta WHERE project = ? AND task_id = ?")
      .run(project, taskId)
  }

  /**
   * update_badge を立てる（hook 受信時 TASK-0017 / REQ-010）。
   * idempotent な upsert: 既存行は update_badge=1 のみ更新し他の状態は保持する。
   * メタ未作成のタスク（added イベント等）には not_synced の最小行を作成して badge=1 とする
   * （hook が一覧読込より先に来ても取りこぼさない）。
   */
  setUpdateBadge(project: string, taskId: string): void {
    this.db
      .prepare(
        `INSERT INTO task_meta (project, task_id, update_badge, meta_updated_at)
         VALUES (?, ?, 1, datetime('now'))
         ON CONFLICT(project, task_id) DO UPDATE SET
           update_badge = 1,
           meta_updated_at = datetime('now')`,
      )
      .run(project, taskId)
  }

  // ========================================
  // settings
  // ========================================

  /** 通知 ON/OFF を取得する（既定 true）。 */
  getNotificationsEnabled(): boolean {
    const row = this.db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(SETTING_NOTIFICATIONS_ENABLED) as { value: string } | undefined
    // 未設定時は安全側ではなく既定仕様（ON）に従う。schema 初期データで 'true' が入る。
    return row?.value !== "false"
  }

  /** 通知 ON/OFF を保存する。 */
  setNotificationsEnabled(enabled: boolean): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(SETTING_NOTIFICATIONS_ENABLED, enabled ? "true" : "false")
  }

  // ========================================
  // notion_project
  // ========================================

  /** プロジェクトの Notion DB 対応を取得する。未登録なら null。 */
  getNotionProject(project: string): NotionProject | null {
    const row = this.db
      .prepare("SELECT * FROM notion_project WHERE project = ?")
      .get(project) as NotionProjectRow | undefined
    if (!row) return null
    return {
      project: row.project,
      notionDatabaseId: row.notion_database_id,
      createdAt: row.created_at,
    }
  }

  /** プロジェクト → Notion DB ID を upsert する（REQ-111）。 */
  upsertNotionProject(project: string, notionDatabaseId: string): void {
    this.db
      .prepare(
        `INSERT INTO notion_project (project, notion_database_id) VALUES (?, ?)
         ON CONFLICT(project) DO UPDATE SET notion_database_id = excluded.notion_database_id`,
      )
      .run(project, notionDatabaseId)
  }

  // ========================================
  // sync_job
  // ========================================

  /** 一括登録ジョブを作成する（status='running'）。 */
  createSyncJob(jobId: string, project: string, total: number): void {
    this.db
      .prepare(
        "INSERT INTO sync_job (job_id, project, total) VALUES (?, ?, ?)",
      )
      .run(jobId, project, total)
  }

  /** ジョブを取得する。未登録なら null。 */
  getSyncJob(jobId: string): SyncJob | null {
    const row = this.db
      .prepare("SELECT * FROM sync_job WHERE job_id = ?")
      .get(jobId) as SyncJobRow | undefined
    if (!row) return null
    return {
      jobId: row.job_id,
      project: row.project,
      total: row.total,
      done: row.done,
      failed: row.failed,
      status: row.status as SyncJob["status"],
      etaSeconds: null,
      startedAt: row.started_at,
    }
  }

  /** ジョブの進捗・状態を部分更新する。 */
  updateSyncJob(jobId: string, update: SyncJobUpdate): void {
    const sets: string[] = []
    const params: Array<number | string> = []
    if (update.done !== undefined) {
      sets.push("done = ?")
      params.push(update.done)
    }
    if (update.failed !== undefined) {
      sets.push("failed = ?")
      params.push(update.failed)
    }
    if (update.status !== undefined) {
      sets.push("status = ?")
      params.push(update.status)
    }
    if (sets.length === 0) return
    params.push(jobId)
    // SET 句の列名は固定文字列のみ（値は全てプレースホルダ）。インジェクション余地なし。
    this.db
      .prepare(`UPDATE sync_job SET ${sets.join(", ")} WHERE job_id = ?`)
      .run(...params)
  }

  // ========================================
  // マッピング
  // ========================================

  /** 生行を TaskMeta へマッピングする（0/1・snap_* を型へ変換）。 */
  private mapTaskMeta(row: TaskMetaRow): TaskMeta {
    // snap_* がすべて存在する場合のみスナップショットとして復元する。
    const deletedSnapshot: DeletedSnapshot | null =
      row.snap_title !== null &&
      row.snap_status !== null &&
      row.snap_created_at !== null &&
      row.snap_updated_at !== null
        ? {
            title: row.snap_title,
            content: row.snap_content ?? "",
            status: row.snap_status as DeletedSnapshot["status"],
            createdAt: row.snap_created_at,
            updatedAt: row.snap_updated_at,
          }
        : null

    return {
      project: row.project,
      taskId: row.task_id,
      notionSyncStatus: row.notion_sync_status as NotionSyncStatus,
      notionPageId: row.notion_page_id,
      updateBadge: row.update_badge === 1,
      isDeleted: row.is_deleted === 1,
      deletedSnapshot,
      lastError: row.last_error,
      metaUpdatedAt: row.meta_updated_at,
    }
  }
}
