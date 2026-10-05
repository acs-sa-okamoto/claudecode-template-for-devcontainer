// 共通ロガー（pino + サイズローテーション）（TASK-0003）
//
// REQ-012: 主要イベント（起動/停止・Notion 連携成否・通知発火・DB エラー）を記録。
// REQ-113 / NFR-403: logs/app.log を 100MB 超で回転、5世代保持。
// NFR-104（P0）: トークン等の機密情報を redact で出力しない。
//
// 設計メモ: pino はサイズ回転を内蔵しないため、書き込み前に rotateIfNeeded を呼ぶ
// ラッパストリームを destination として渡す。これにより閾値超過時に実ファイルを
// 回転してから追記する。テストでは sync:true・小さい閾値で実 I/O 検証する。

import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import pino from "pino"
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_GENERATIONS,
  rotateIfNeeded,
} from "./rotation.js"

export { DEFAULT_MAX_BYTES, DEFAULT_MAX_GENERATIONS }

/** ロガー生成オプション。 */
export interface LoggerOptions {
  /** 出力先ファイル（既定 logs/app.log）。 */
  filePath?: string
  /** ログレベル（既定 info）。 */
  level?: pino.Level
  /** 同期書き込み（テスト時 true 推奨）。 */
  sync?: boolean
  /** 回転閾値（既定 100MB）。 */
  maxBytes?: number
  /** 保持世代数（既定 5）。 */
  maxGenerations?: number
}

/** アプリ共通ロガーのインターフェース（主要イベントのヘルパー付き）。 */
export interface AppLogger extends pino.Logger {
  /** 起動を記録（REQ-012）。 */
  logStartup(port: number): void
  /** 停止を記録（REQ-012）。 */
  logShutdown(): void
  /** Notion 連携の成否を記録（REQ-012）。トークンは渡さない。 */
  logNotionSync(project: string, taskId: string, success: boolean): void
  /** 通知発火を記録（REQ-012）。 */
  logNotification(count: number): void
  /** DB エラーを記録（REQ-012）。機密を含めない。 */
  logDbError(message: string): void
}

/**
 * 機密情報を伏せる redact 設定（NFR-104, P0）。
 * よくある秘匿キーをワイルドカードで網羅する。
 */
const REDACT_PATHS = [
  "token",
  "*.token",
  "notionToken",
  "*.notionToken",
  "NOTION_API_TOKEN",
  "*.NOTION_API_TOKEN",
  "apiToken",
  "*.apiToken",
  "authorization",
  "*.authorization",
  "password",
  "*.password",
  "secret",
  "*.secret",
]

const DEFAULT_FILE_PATH = "logs/app.log"

/**
 * ロガーを生成する。書き込み前に rotateIfNeeded を呼ぶことで
 * サイズ超過時に実ファイルを回転してから追記する。
 */
export function createLogger(options: LoggerOptions = {}): AppLogger {
  const filePath = options.filePath ?? DEFAULT_FILE_PATH
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const maxGenerations = options.maxGenerations ?? DEFAULT_MAX_GENERATIONS

  // 出力先ディレクトリを用意する（logs/ など）。
  mkdirSync(dirname(filePath), { recursive: true })

  // sonic-boom（pino の高速 destination）。sync はテスト時に内容を即読み出すため。
  let dest = pino.destination({
    dest: filePath,
    sync: options.sync ?? false,
    mkdir: true,
  })

  // 書き込み前に回転を判定するラッパ。回転したら destination を開き直す。
  const rotatingStream = {
    write(chunk: string): void {
      if (rotateIfNeeded(filePath, maxBytes, maxGenerations)) {
        // 旧 destination を閉じ、回転後の新しいファイルへ向け直す。
        dest.end()
        dest = pino.destination({
          dest: filePath,
          sync: options.sync ?? false,
          mkdir: true,
        })
      }
      dest.write(chunk)
    },
  }

  const base = pino(
    {
      level: options.level ?? "info",
      redact: { paths: REDACT_PATHS, censor: "[Redacted]" },
    },
    rotatingStream,
  ) as AppLogger

  // 主要イベントのヘルパー（REQ-012）。機密は引数に取らない。
  base.logStartup = (port: number): void => {
    base.info({ event: "startup", port }, "task-bridge を起動しました")
  }
  base.logShutdown = (): void => {
    base.info({ event: "shutdown" }, "task-bridge を停止しました")
  }
  base.logNotionSync = (
    project: string,
    taskId: string,
    success: boolean,
  ): void => {
    const payload = { event: "notion_sync", project, taskId, success }
    if (success) {
      base.info(payload, "Notion 連携に成功しました")
    } else {
      base.error(payload, "Notion 連携に失敗しました")
    }
  }
  base.logNotification = (count: number): void => {
    base.info({ event: "notification", count }, "通知を発火しました")
  }
  base.logDbError = (message: string): void => {
    base.error({ event: "db_error" }, message)
  }

  return base
}

/** アプリ全体で共有する単一ロガー（logs/app.log）。 */
export const logger: AppLogger = createLogger()
