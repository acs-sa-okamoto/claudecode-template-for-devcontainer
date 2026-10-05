// 環境変数の読み込みとバリデーション（TASK-0002）
//
// 設計契約: docs/spec/task-bridge/design/interfaces.ts の EnvConfig。
// EnvConfig.PORT は .env 上の生表現として string だが、アプリ内で使う検証済み
// 構成は PORT を number として公開する（serve の port が number のため）。
// そのため公開型を AppConfig（PORT: number）として定義する。
//
// セキュリティ（P0 / NFR-101・NFR-104）:
// - シークレット（トークン）はエラーメッセージ・ログに出さない。
// - 検証失敗時は「欠落キー名のみ」を報告する（値は出さない）。

/** PORT の既定値（127.0.0.1:3939、architecture.md で確定）。 */
export const DEFAULT_PORT = 3939

/** アプリメタ DB パスの既定値（architecture.md / interfaces.ts）。 */
export const DEFAULT_APP_DB_PATH = "data/app.db"

/** ソース DB パスの既定値（beam の tasks.db。view モードで未指定時に使用）。 */
export const DEFAULT_SOURCE_DB_PATH = "data/tasks.db"

/**
 * 動作モード。
 * - "full": 通常モード（Notion 連携あり）。NOTION_* が必須。
 * - "view": ビューア専用モード（beam ダッシュボード用）。タスク一覧の閲覧とライブ更新のみ。
 *           Notion 連携は使わないため NOTION_* は不要で、SOURCE_DB_PATH だけで起動できる。
 *           環境変数 BEAM_DASHBOARD_MODE=view で有効化。
 */
export type DashboardMode = "full" | "view"

/** 検証済みのアプリ構成。PORT は number で公開する。 */
export interface AppConfig {
  mode: DashboardMode
  NOTION_API_TOKEN: string
  NOTION_PARENT_PAGE_ID: string
  SOURCE_DB_PATH: string
  PORT: number
  APP_DB_PATH: string
}

/** full モードの必須環境変数（欠落時にキー名のみ報告する）。 */
const FULL_REQUIRED_KEYS = [
  "NOTION_API_TOKEN",
  "NOTION_PARENT_PAGE_ID",
  "SOURCE_DB_PATH",
] as const

/**
 * view モードの必須環境変数。なし（ゼロ設定で起動可能）。
 * SOURCE_DB_PATH は未指定なら DEFAULT_SOURCE_DB_PATH（data/tasks.db）にフォールバックする。
 */
const VIEW_REQUIRED_KEYS = [] as const

const PORT_MIN = 1
const PORT_MAX = 65535

/**
 * 与えられた環境変数マップから AppConfig を構築・検証する。
 * 純粋関数（process.env に依存しない）でテスト容易性を高める。
 *
 * @throws Error 必須欠落・PORT 不正時。メッセージにシークレット値は含めない。
 */
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  // 動作モードを決定する（BEAM_DASHBOARD_MODE=view のときのみ view）。
  const mode: DashboardMode = env.BEAM_DASHBOARD_MODE === "view" ? "view" : "full"
  const requiredKeys = mode === "view" ? VIEW_REQUIRED_KEYS : FULL_REQUIRED_KEYS

  // 必須変数の欠落（未設定 or 空文字）を収集する。値は触れずキー名のみ扱う。
  const missing: string[] = []
  for (const key of requiredKeys) {
    const value = env[key]
    if (value === undefined || value.trim() === "") {
      missing.push(key)
    }
  }
  if (missing.length > 0) {
    // P0: 値は出さず、欠落キー名のみを列挙する。
    throw new Error(
      `必須の環境変数が設定されていません: ${missing.join(", ")}`,
    )
  }

  // PORT の解釈（未指定は既定、指定時は数値・範囲を検証）。
  const port = parsePort(env.PORT)

  const appDbPath =
    env.APP_DB_PATH && env.APP_DB_PATH.trim() !== ""
      ? env.APP_DB_PATH
      : DEFAULT_APP_DB_PATH

  // SOURCE_DB_PATH: full モードは上の必須検証で保証済み。view モードは未指定なら既定値。
  const sourceDbPath =
    env.SOURCE_DB_PATH && env.SOURCE_DB_PATH.trim() !== ""
      ? env.SOURCE_DB_PATH
      : DEFAULT_SOURCE_DB_PATH

  return {
    mode,
    // view モードでは NOTION_* が未設定でも空文字で通す（Notion 連携を使わないため）。
    NOTION_API_TOKEN: env.NOTION_API_TOKEN ?? "",
    NOTION_PARENT_PAGE_ID: env.NOTION_PARENT_PAGE_ID ?? "",
    SOURCE_DB_PATH: sourceDbPath,
    PORT: port,
    APP_DB_PATH: appDbPath,
  }
}

/**
 * PORT 文字列を解釈する。未指定なら既定値、不正なら例外（値はトークンでないが
 * 一貫性のためメッセージはキー名と入力範囲のみとする）。
 */
function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_PORT
  }
  const port = Number(raw)
  if (!Number.isInteger(port)) {
    throw new Error("環境変数 PORT は整数で指定してください")
  }
  if (port < PORT_MIN || port > PORT_MAX) {
    throw new Error(
      `環境変数 PORT は ${PORT_MIN}〜${PORT_MAX} の範囲で指定してください`,
    )
  }
  return port
}

/**
 * 実際の利用経路: process.env から読み込む薄いラッパ。
 * アプリ起動時（src/server/index.ts）に一度呼び出す。
 */
export function loadConfigFromProcess(): AppConfig {
  return loadConfig(process.env)
}
