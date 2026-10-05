// task-bridge 共通型定義
//
// 設計契約 docs/spec/task-bridge/design/interfaces.ts を実装へ反映したもの。
// interfaces.ts を単一の真実とし、ここで独自に再定義して乖離させないこと（TASK-0005 注意事項）。
// サーバー・フロントエンド双方から import される（src/shared）。

// ========================================
// 列挙型
// ========================================

/** タスクのステータス（4値）。REQ-403 / PRD FR-20 */
export type TaskStatus = "ready" | "in_progress" | "in_review" | "done"

/** Notion 連携ステータス（5値）。REQ-404 / PRD FR-21 */
export type NotionSyncStatus =
  | "not_synced"
  | "syncing"
  | "synced"
  | "pending_deletion"
  | "sync_failed"

/** hook 経由で受信する更新イベントの種別。REQ-007 / PRD FR-08 */
export type HookEventType = "added" | "updated" | "deleted" | "status_changed"

/** テーマ。REQ-301 / PRD FR-23 */
export type Theme = "light" | "dark"

// ========================================
// エンティティ定義
// ========================================

/**
 * ソース DB（Claude Code が書き込む、読取専用）のタスク行。
 * プロジェクト = テーブル。project はテーブル名から導出。
 */
export interface SourceTask {
  taskId: string
  project: string
  title: string
  content: string
  status: TaskStatus
  createdAt: string
  updatedAt: string
}

/** アプリメタ DB が保持するタスクごとの連携メタ情報。REQ-105/106 */
export interface TaskMeta {
  project: string
  taskId: string
  notionSyncStatus: NotionSyncStatus
  notionPageId: string | null
  updateBadge: boolean
  isDeleted: boolean
  deletedSnapshot: DeletedSnapshot | null
  lastError: string | null
  metaUpdatedAt: string
}

/** 削除済みタスクのスナップショット（pending_deletion 表示用）。REQ-105 / AC-13 */
export interface DeletedSnapshot {
  title: string
  content: string
  status: TaskStatus
  createdAt: string
  updatedAt: string
}

/** プロジェクトと Notion データベースの対応。REQ-111 / AC-18 */
export interface NotionProject {
  project: string
  notionDatabaseId: string
  createdAt: string
}

/** 一覧表示用にマージされたタスク（SourceTask + TaskMeta）。REQ-002 / AC-06 */
export interface TaskView {
  taskId: string
  project: string
  title: string
  content: string
  status: TaskStatus
  createdAt: string
  updatedAt: string
  notionSyncStatus: NotionSyncStatus
  isDeleted: boolean
  updateBadge: boolean
}

/** プロジェクト単位でグループ化した一覧。REQ-005 / AC-09 */
export interface ProjectGroup {
  project: string
  notionLinked: boolean
  tasks: TaskView[]
}

// ========================================
// 設定
// ========================================

/** アプリ設定（メタ DB settings テーブル）。REQ-101/102 */
export interface AppSettings {
  notificationsEnabled: boolean
}

// ========================================
// API リクエスト/レスポンス
// ========================================

/** 共通レスポンス。api-endpoints.md 共通フォーマット */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: ErrorResponse
}

/** エラーレスポンス。NFR-302/303 */
export interface ErrorResponse {
  code: string
  message: string
}

/** 一覧取得レスポンス。GET /api/tasks */
export interface GetTasksResponse {
  projects: ProjectGroup[]
}

/** hook 受信リクエスト（Claude Code → POST /api/hook）。REQ-007 / FR-08 */
export interface HookEventRequest {
  type: HookEventType
  project: string
  taskId: string
}

/** 個別/一括同期の結果（タスク単位）。REQ-004/108/109 */
export interface SyncResult {
  project: string
  taskId: string
  status: NotionSyncStatus
  notionPageId?: string
  error?: string
}

/** 一括登録ジョブ（バックグラウンド処理 + 進捗）。REQ-011/204 / AC-10 / NFR-005 */
export interface SyncJob {
  jobId: string
  project: string
  total: number
  done: number
  failed: number
  status: "running" | "completed" | "timeout" | "failed"
  etaSeconds: number | null
  startedAt: string
}

/** 通知 ON/OFF 切替リクエスト。REQ-101/102 / AC-16 */
export interface ToggleNotificationsRequest {
  enabled: boolean
}

// ========================================
// SSE イベント（サーバー → ブラウザ）
// ========================================

/** 一覧の再取得を促すライブ更新イベント。REQ-010 */
export interface TasksChangedEvent {
  type: "tasks_changed"
  changedTaskIds: Array<{ project: string; taskId: string }>
}

// ========================================
// Notifier（5秒集約 → BurntToast）
// ========================================

/** 集約ウィンドウの状態（インメモリ）。REQ-008 / NFR-004 / EDGE-102 */
export interface AggregationWindow {
  startedAt: number
  count: number
}

// ========================================
// 環境変数（.env）
// ========================================

/**
 * .env の生表現に対応する型。REQ-405/406/REQ-111 / prep.md
 * 検証済みの構成は src/server/config/env.ts の AppConfig（PORT: number）を使う。
 */
export interface EnvConfig {
  NOTION_API_TOKEN: string
  NOTION_PARENT_PAGE_ID: string
  SOURCE_DB_PATH: string
  PORT: string
  APP_DB_PATH?: string
}
