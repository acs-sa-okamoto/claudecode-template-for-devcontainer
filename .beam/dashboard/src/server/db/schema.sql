-- task-bridge アプリメタ DB スキーマ（data/app.db, 読み書き）
--
-- 単一の真実は docs/spec/task-bridge/design/database-schema.sql。
-- 本ファイルはその実装ミラー（テーブル定義のみ。PRAGMA は appDb.ts で接続単位に設定する）。
-- ソース DB（読取専用・プロジェクト=テーブル）は本ファイルでは定義しない（外部所有）。

-- task_meta: タスクごとの連携メタ情報（REQ-105/106/404）
CREATE TABLE IF NOT EXISTS task_meta (
    project              TEXT NOT NULL,
    task_id              INTEGER NOT NULL,
    notion_sync_status   TEXT NOT NULL DEFAULT 'not_synced',
    notion_page_id       TEXT,
    update_badge         INTEGER NOT NULL DEFAULT 0,
    is_deleted           INTEGER NOT NULL DEFAULT 0,
    snap_title           TEXT,
    snap_content         TEXT,
    snap_status          TEXT,
    snap_created_at      TEXT,
    snap_updated_at      TEXT,
    last_error           TEXT,
    meta_updated_at      TEXT NOT NULL DEFAULT (datetime('now')),

    PRIMARY KEY (project, task_id),
    CONSTRAINT chk_sync_status CHECK (
        notion_sync_status IN ('not_synced','syncing','synced','pending_deletion','sync_failed')
    ),
    CONSTRAINT chk_snap_status CHECK (
        snap_status IS NULL OR snap_status IN ('ready','in_progress','in_review','done')
    )
);

-- notion_project: プロジェクト → Notion データベースID の対応（REQ-111/AC-18）
CREATE TABLE IF NOT EXISTS notion_project (
    project             TEXT PRIMARY KEY,
    notion_database_id  TEXT NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- settings: アプリ設定（キーバリュー）（REQ-101/102）
CREATE TABLE IF NOT EXISTS settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);

-- sync_job: 一括登録ジョブの進捗（REQ-011/204・AC-10・NFR-005）
CREATE TABLE IF NOT EXISTS sync_job (
    job_id      TEXT PRIMARY KEY,
    project     TEXT NOT NULL,
    total       INTEGER NOT NULL,
    done        INTEGER NOT NULL DEFAULT 0,
    failed      INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'running',
    started_at  TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT chk_job_status CHECK (
        status IN ('running','completed','timeout','failed')
    )
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_task_meta_project_status
    ON task_meta(project, notion_sync_status);
CREATE INDEX IF NOT EXISTS idx_task_meta_badge
    ON task_meta(update_badge);
CREATE INDEX IF NOT EXISTS idx_sync_job_status
    ON sync_job(status);

-- 初期データ: 通知はデフォルト ON（REQ-101）
INSERT OR IGNORE INTO settings(key, value) VALUES ('notifications_enabled', 'true');
