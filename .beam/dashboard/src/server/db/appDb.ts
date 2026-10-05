// アプリメタ DB（data/app.db）の接続・初期化（TASK-0004）
//
// better-sqlite3（同期 API）で data/app.db を開き、schema.sql を冪等に適用する。
// 単一の真実は docs/spec/task-bridge/design/database-schema.sql、その実装ミラーが
// src/server/db/schema.sql。
//
// 注意: ソース DB は読取専用（別系統）。本モジュールは読み書き対象の app.db のみを扱う。
// セキュリティ: 値は常にプレースホルダでバインドする（本モジュールは DDL + 固定初期データ
// のみで動的値連結なし。インジェクション余地なし、P0）。

import { mkdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import Database from "better-sqlite3"
import type { AppConfig } from "../config/env.js"

const moduleDir = dirname(fileURLToPath(import.meta.url))

/**
 * スキーマ SQL を読み込む。
 * 開発（tsx/vitest, src 配下）でもビルド後（dist 配下）でも、同階層の schema.sql を参照する。
 * build スクリプトで schema.sql を dist/server/db へコピーする前提（package.json）。
 */
function loadSchemaSql(): string {
  return readFileSync(join(moduleDir, "schema.sql"), "utf8")
}

/**
 * 指定パスのアプリメタ DB を開き、PRAGMA 設定とスキーマ適用を行って返す。
 * 冪等（CREATE TABLE IF NOT EXISTS / INSERT OR IGNORE）。再実行しても安全。
 *
 * @param dbPath data/app.db 等のファイルパス
 */
export function openAppDb(dbPath: string): Database.Database {
  // 親ディレクトリを用意する（data/ 等）。
  mkdirSync(dirname(dbPath), { recursive: true })

  const db = new Database(dbPath)
  // 読み書き並行性（NFR-402）と参照整合性。接続単位の設定なので毎回行う。
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")

  // スキーマ（DDL + 初期データ）を冪等適用。
  db.exec(loadSchemaSql())

  return db
}

/**
 * 起動フロー用ラッパ: 検証済み AppConfig（TASK-0002）の APP_DB_PATH で初期化する。
 */
export function initAppDb(config: AppConfig): Database.Database {
  return openAppDb(config.APP_DB_PATH)
}
