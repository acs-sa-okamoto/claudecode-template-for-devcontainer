// NotionClient: Notion 公式 API 連携クライアント（TASK-0009）。
//
// 設計契約: requirements.md（REQ-006/108/109/110/111, NFR-301/006）/ architecture.md。
// - DB 自動作成（REQ-111）: NOTION_PARENT_PAGE_ID 配下にプロジェクト同名 DB を作成。
// - ページ登録（REQ-006）: task_id/title/content/project/status/created_at/updated_at の 7 プロパティ。
// - ページ削除（REQ-106）: archived: true でアーカイブ。
// - リトライ（REQ-108）: ネットワークエラー・5xx で最大 maxRetries 回試行。
// - 429（REQ-110）: Retry-After 秒だけ待機してから再試行。
//
// セキュリティ（P0 / NFR-006）:
// - API トークンはコンストラクタ注入のみ（直書き禁止）。Authorization ヘッダにのみ使用し、
//   例外メッセージ・ログに出さない。レスポンス本文も例外メッセージに含めない（識別子・種別のみ）。
// - 接続先は Notion 公式 API ベース URL に固定（任意 URL を取得しない＝SSRF 回避）。

import type { SourceTask } from "../../shared/index.js"

/** Notion API のベース URL（固定）。 */
const NOTION_API_BASE = "https://api.notion.com/v1"
/** Notion API バージョン（公式の安定版日付）。 */
const NOTION_VERSION = "2022-06-28"
/** 既定の最大試行回数（初回 + リトライ含む）。REQ-108 = 最大3回。 */
const DEFAULT_MAX_RETRIES = 3
/** Retry-After 欠落時の既定待機（ミリ秒）。 */
const DEFAULT_RETRY_AFTER_MS = 1000

/** 注入可能な fetch 互換関数（テストでフェイク差し替え）。 */
export type NotionFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>

/** 注入可能な sleep（テストで待機を無効化・検証）。 */
export type SleepFn = (ms: number) => Promise<void>

/** NotionClient の依存（トークン等）。 */
export interface NotionClientDeps {
  /** Notion API トークン（AppConfig.NOTION_API_TOKEN）。直書き禁止・ログ禁止。 */
  token: string
  /** DB 自動作成先の親ページ ID（AppConfig.NOTION_PARENT_PAGE_ID）。 */
  parentPageId: string
  /** fetch 実装（既定 globalThis.fetch）。 */
  fetch?: NotionFetch
  /** sleep 実装（既定 setTimeout）。 */
  sleep?: SleepFn
  /** 最大試行回数（既定 3）。 */
  maxRetries?: number
}

/**
 * Notion API エラー。メッセージには識別用の最小情報のみを含め、
 * トークン・レスポンス本文は含めない（NFR-006 / P0）。
 */
export class NotionApiError extends Error {
  /** HTTP ステータス（ネットワークエラー時は undefined）。 */
  readonly status?: number
  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message, { cause: options?.cause })
    this.name = "NotionApiError"
    this.status = options?.status
  }
}

/** 既定の sleep（実時間待機）。 */
const realSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Notion 公式 API クライアント。リトライ・429 追従を内蔵する。
 */
export class NotionClient {
  private readonly token: string
  private readonly parentPageId: string
  private readonly fetchImpl: NotionFetch
  private readonly sleep: SleepFn
  private readonly maxRetries: number

  constructor(deps: NotionClientDeps) {
    this.token = deps.token
    this.parentPageId = deps.parentPageId
    // 既定は global fetch（Node 22 に標準搭載）。
    this.fetchImpl = deps.fetch ?? ((url, init) => fetch(url, init))
    this.sleep = deps.sleep ?? realSleep
    this.maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES
  }

  /**
   * プロジェクト同名の Notion DB を親ページ配下に作成し database_id を返す（REQ-111）。
   * タスク登録に必要な 7 プロパティのスキーマを定義する。
   */
  async createDatabase(project: string): Promise<string> {
    const body = {
      parent: { type: "page_id", page_id: this.parentPageId },
      title: [{ type: "text", text: { content: project } }],
      properties: {
        // title プロパティは Notion DB に必須。task_id を一意キー的に扱うが title 型は別途。
        title: { title: {} },
        // task_id はソース DB では TEXT（例 "TASK-0001"）。number ではなく rich_text で保持する。
        task_id: { rich_text: {} },
        content: { rich_text: {} },
        project: { rich_text: {} },
        status: { rich_text: {} },
        created_at: { rich_text: {} },
        updated_at: { rich_text: {} },
      },
    }
    const json = await this.request(`${NOTION_API_BASE}/databases`, "POST", body)
    return this.requireId(json)
  }

  /**
   * タスクを Notion ページとして登録し page_id を返す（REQ-006）。
   * 7 プロパティ（task_id/title/content/project/status/created_at/updated_at）を送信する。
   */
  async createPage(databaseId: string, task: SourceTask): Promise<string> {
    const body = {
      parent: { database_id: databaseId },
      properties: {
        // Notion の title プロパティ名は "title"。可読性のため title にタスク名を入れる。
        title: { title: [{ text: { content: task.title } }] },
        task_id: { rich_text: [{ text: { content: task.taskId } }] },
        content: { rich_text: [{ text: { content: task.content } }] },
        project: { rich_text: [{ text: { content: task.project } }] },
        status: { rich_text: [{ text: { content: task.status } }] },
        created_at: { rich_text: [{ text: { content: task.createdAt } }] },
        updated_at: { rich_text: [{ text: { content: task.updatedAt } }] },
      },
    }
    const json = await this.request(`${NOTION_API_BASE}/pages`, "POST", body)
    return this.requireId(json)
  }

  /**
   * 既存の Notion ページを最新のタスク内容で更新する（再同期）。
   * createPage と同じ 7 プロパティを PATCH /pages/{id} で上書きする
   * （重複ページを作らずに同期済みタスクの変更を反映する）。
   */
  async updatePage(pageId: string, task: SourceTask): Promise<void> {
    const body = {
      properties: {
        title: { title: [{ text: { content: task.title } }] },
        task_id: { rich_text: [{ text: { content: task.taskId } }] },
        content: { rich_text: [{ text: { content: task.content } }] },
        project: { rich_text: [{ text: { content: task.project } }] },
        status: { rich_text: [{ text: { content: task.status } }] },
        created_at: { rich_text: [{ text: { content: task.createdAt } }] },
        updated_at: { rich_text: [{ text: { content: task.updatedAt } }] },
      },
    }
    await this.request(`${NOTION_API_BASE}/pages/${pageId}`, "PATCH", body)
  }

  /**
   * Notion ページをアーカイブ（削除）する（REQ-106）。
   */
  async deletePage(pageId: string): Promise<void> {
    await this.request(`${NOTION_API_BASE}/pages/${pageId}`, "PATCH", {
      archived: true,
    })
  }

  /**
   * リトライ・429 追従つきで Notion API を呼ぶ。
   * - 2xx: JSON を返す。
   * - 429: Retry-After 秒待機して再試行（試行回数にカウント）。
   * - ネットワークエラー・5xx: 再試行。試行上限超過で NotionApiError。
   * - 4xx（429 以外）: リトライせず即 NotionApiError（クライアント側起因）。
   */
  private async request(
    url: string,
    method: string,
    body: unknown,
  ): Promise<unknown> {
    let lastError: NotionApiError | null = null

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      let res: Response
      try {
        res = await this.fetchImpl(url, {
          method,
          headers: {
            authorization: `Bearer ${this.token}`,
            "notion-version": NOTION_VERSION,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        })
      } catch (e) {
        // ネットワークエラー: 再試行対象。メッセージに詳細・トークンは残さない。
        lastError = new NotionApiError("Notion API への通信に失敗しました", {
          cause: e,
        })
        await this.backoffBeforeRetry(attempt)
        continue
      }

      if (res.ok) {
        return (await res.json()) as unknown
      }

      if (res.status === 429) {
        // レート制限: Retry-After 秒だけ待機してから再試行する（REQ-110）。
        const waitMs = this.parseRetryAfterMs(res.headers.get("retry-after"))
        lastError = new NotionApiError("Notion API がレート制限を返しました", {
          status: 429,
        })
        // 最後の試行で 429 ならこれ以上待たずに失敗扱い（無駄な待機を避ける）。
        if (attempt < this.maxRetries) {
          await this.sleep(waitMs)
        }
        continue
      }

      if (res.status >= 500) {
        // サーバーエラー: 再試行対象。本文は読まずステータスのみ保持（NFR-006）。
        lastError = new NotionApiError("Notion API がサーバーエラーを返しました", {
          status: res.status,
        })
        await this.backoffBeforeRetry(attempt)
        continue
      }

      // それ以外の 4xx はリトライ不要（入力起因）。本文・トークンは含めない。
      throw new NotionApiError(
        `Notion API がエラーを返しました (status=${res.status})`,
        { status: res.status },
      )
    }

    // 試行上限を超過。
    throw (
      lastError ??
      new NotionApiError("Notion API 呼び出しが上限回数で失敗しました")
    )
  }

  /** Retry-After（秒文字列）をミリ秒に変換する。欠落・不正時は既定値。 */
  private parseRetryAfterMs(headerValue: string | null): number {
    if (!headerValue) return DEFAULT_RETRY_AFTER_MS
    const seconds = Number(headerValue)
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return DEFAULT_RETRY_AFTER_MS
    }
    return Math.round(seconds * 1000)
  }

  /** 再試行前の待機（最後の試行では待たない）。 */
  private async backoffBeforeRetry(attempt: number): Promise<void> {
    if (attempt < this.maxRetries) {
      await this.sleep(DEFAULT_RETRY_AFTER_MS)
    }
  }

  /** レスポンス JSON から id を取り出す。欠落時はエラー。 */
  private requireId(json: unknown): string {
    const id = (json as { id?: unknown } | null)?.id
    if (typeof id !== "string" || id.length === 0) {
      throw new NotionApiError("Notion API レスポンスに id が含まれていません")
    }
    return id
  }
}
