// TaskReader: ソース DB（Claude Code が書き込む、読取専用）から全プロジェクト
// （= テーブル）のタスクを読み込むサービス（TASK-0006）。
//
// 設計契約: docs/spec/task-bridge/design/architecture.md（セキュリティ: テーブル名
// ホワイトリスト + 識別子クォート）/ interfaces.ts（SourceTask）/ database-schema.sql
// （ソース DB 参考形状）。
//
// セキュリティ（P0）:
// - ソース DB は readonly: true で開き、一切書き込まない（誤書込防止 NFR-303）。
// - テーブル名（プロジェクト名）は値バインド不可。sqlite_master から取得した実在名のみを
//   識別子パターンでホワイトリスト照合し、ダブルクォートでエスケープしてから結合する
//   （SQL インジェクション防止）。WHERE 値は常にプレースホルダでバインドする。
// - 本サービスはトークン等のシークレットを扱わない（ログ漏えいの余地なし）。
//
// 可用性: ソース DB は beam が後から生成するため、起動時点で不在でもクラッシュさせない。
// 「不在＝まだタスクが無い」として空一覧で扱い、ファイルが作成されたら次回の読取で拾う
// （遅延オープン）。「存在するが開けない（破損・権限）」場合のみ接続エラーとする。

import { existsSync } from "node:fs"
import Database from "better-sqlite3"
import { ERROR_CODES, type SourceTask, type TaskStatus } from "../../shared/index.js"

/**
 * ソース DB への接続失敗を表すエラー。
 * `code = DB_CONNECTION_FAILED` で上位（API 層）が一貫して扱える（REQ-112 / EDGE-001）。
 */
export class SourceDbConnectionError extends Error {
  /** API エラーコード（ERROR_CODES.DB_CONNECTION_FAILED）。 */
  readonly code: typeof ERROR_CODES.DB_CONNECTION_FAILED
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "SourceDbConnectionError"
    this.code = ERROR_CODES.DB_CONNECTION_FAILED
  }
}

/**
 * 正当な SQLite 識別子（テーブル名）のパターン。これ以外は読取対象から除外する。
 * ハイフンを許可する: beam が生成するソース DB はテーブル名 = 要件名（ケバブケース、
 * 例 `task-bridge`）のため。識別子は quoteIdentifier でダブルクォートして結合するため
 * ハイフンを許可しても SQL インジェクションの余地はない（英数字・アンダースコア・ハイフンのみ）。
 */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/

/** SourceTask の必須列。これらを持たないテーブルはタスクテーブルとみなさない。 */
const REQUIRED_COLUMNS = [
  "task_id",
  "title",
  "content",
  "status",
  "created_at",
  "updated_at",
] as const

/** ソース DB から取得する生の行（実カラム命名差は本クラスで吸収する）。 */
interface RawTaskRow {
  task_id: string
  title: string
  content: string | null
  status: string
  created_at: string
  updated_at: string
}

/**
 * 検証済みの識別子をダブルクォートでエスケープする。
 * 既に `IDENTIFIER_PATTERN` を通過しているため `"` は含まれないが、SQLite の
 * 識別子クォート規約（`"` を `""` に二重化）に従って二重防御する。
 */
function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, "\"\"")}"`
}

/**
 * ソース DB を readonly で開き、プロジェクト（テーブル）単位でタスクを読み出す。
 * 接続は遅延オープンしてキャッシュする。利用後は `close()` を呼ぶこと。
 */
export class TaskReader {
  private readonly sourceDbPath: string
  /** 遅延オープンした接続をキャッシュする。未オープンなら null。 */
  private db: Database.Database | null = null

  /**
   * @param sourceDbPath ソース DB ファイルパス（AppConfig.SOURCE_DB_PATH）
   *
   * コンストラクタでは接続しない（遅延オープン）。ソース DB は beam が後から生成する
   * ため、起動時点で不在でもクラッシュさせない（view モードで「タスクがまだ無い」状態を
   * 空一覧として扱う）。実際の接続は最初の読取時に getDb() で行う。
   */
  constructor(sourceDbPath: string) {
    this.sourceDbPath = sourceDbPath
  }

  /**
   * ソース DB を遅延オープンして返す。一度開いた接続はキャッシュする。
   * - ファイルが存在しない → null（まだタスクが無い。空として扱い、後で作成されたら次回拾う）
   * - 存在するが開けない（破損・権限）→ SourceDbConnectionError
   */
  private getDb(): Database.Database | null {
    if (this.db && this.db.open) return this.db
    // 不在は「エラー」ではなく「まだ無い」。空として扱う（次回の読取で再試行）。
    if (!existsSync(this.sourceDbPath)) return null
    try {
      // readonly: true でアプリ側からの書込を構造的に防止する。
      this.db = new Database(this.sourceDbPath, {
        readonly: true,
        fileMustExist: true,
      })
      return this.db
    } catch (e) {
      // パス（シークレットではない）は含めず、原因のみ cause で保持する。
      throw new SourceDbConnectionError(
        "ソース DB に接続できません。ファイルを確認してください",
        { cause: e },
      )
    }
  }

  /**
   * 検証を通過したプロジェクト（テーブル）名を列挙する。
   * ソース DB が未作成なら空配列を返す。
   * - sqlite_master の type='table' を走査
   * - sqlite_* 内部テーブルを除外
   * - 識別子パターンに反する名前を除外（SQL インジェクション防止）
   * - SourceTask の必須列を持たないテーブルを除外
   */
  listProjects(): string[] {
    const db = this.getDb()
    if (!db) return []
    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC",
      )
      .all() as Array<{ name: string }>

    const projects: string[] = []
    for (const { name } of rows) {
      if (name.startsWith("sqlite_")) continue
      // ホワイトリスト照合: 識別子パターンに合致しない実在名は対象外。
      if (!IDENTIFIER_PATTERN.test(name)) continue
      if (!this.hasRequiredColumns(db, name)) continue
      projects.push(name)
    }
    return projects
  }

  /**
   * 全プロジェクトのタスクを読む。ソース DB が未作成なら空配列。
   * プロジェクト名昇順 → 各プロジェクト内 task_id 昇順で返す（REQ-003）。
   */
  readAllTasks(): SourceTask[] {
    const result: SourceTask[] = []
    for (const project of this.listProjects()) {
      result.push(...this.readProjectTasks(project))
    }
    return result
  }

  /**
   * 単一プロジェクトのタスクを task_id 昇順で読む。
   * ソース DB が未作成なら空配列。
   * @param project 検証済みであることを内部で再検証する（防御的）
   */
  readProjectTasks(project: string): SourceTask[] {
    // 防御的に再検証: 外部から任意文字列が渡されても識別子パターンを通さない限り結合しない。
    if (!IDENTIFIER_PATTERN.test(project)) {
      return []
    }
    const db = this.getDb()
    if (!db) return []
    const quoted = quoteIdentifier(project)
    // テーブル名のみ検証済み識別子を結合。値（あれば）はプレースホルダ。
    const rows = db
      .prepare(
        `SELECT task_id, title, content, status, created_at, updated_at FROM ${quoted} ORDER BY task_id ASC`,
      )
      .all() as RawTaskRow[]

    return rows.map((row) => this.mapRow(project, row))
  }

  /** 接続を閉じる（未オープンなら何もしない）。 */
  close(): void {
    if (this.db && this.db.open) {
      this.db.close()
    }
  }

  /**
   * テスト用フック: readonly 接続では書込が失敗することを確認するためのヘルパー。
   * 本番ロジックでは使用しない。
   * @internal
   */
  rawWriteForTest(): void {
    const db = this.getDb()
    if (!db) throw new Error("source db is not available")
    db.exec("CREATE TABLE __should_fail__ (x INTEGER)")
  }

  /** 指定テーブルが SourceTask の必須列をすべて持つか判定する。 */
  private hasRequiredColumns(db: Database.Database, table: string): boolean {
    // table は呼び出し元で識別子検証済み。PRAGMA table_info は識別子を要求するためクォートする。
    const quoted = quoteIdentifier(table)
    const cols = db
      .prepare(`PRAGMA table_info(${quoted})`)
      .all() as Array<{ name: string }>
    const colNames = new Set(cols.map((c) => c.name))
    return REQUIRED_COLUMNS.every((c) => colNames.has(c))
  }

  /** 生の行を SourceTask へマッピングする（実カラム命名差の吸収点）。 */
  private mapRow(project: string, row: RawTaskRow): SourceTask {
    return {
      taskId: row.task_id,
      project,
      title: row.title,
      // content は NULL 許容（schema.sql 参考形状）。空文字へ正規化して型に合わせる。
      content: row.content ?? "",
      status: row.status as TaskStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
