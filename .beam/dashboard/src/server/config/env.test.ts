import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  DEFAULT_APP_DB_PATH,
  DEFAULT_PORT,
  DEFAULT_SOURCE_DB_PATH,
  loadConfig,
} from "./env.js"

// 環境変数を直接渡せる loadConfig(env) を対象にする（process.env を汚さない）。
// 検証ロジックを純粋関数として切り出すことでテストを安定させる。

const validEnv = (): NodeJS.ProcessEnv => ({
  NOTION_API_TOKEN: "ntn_dummy_token_for_test",
  NOTION_PARENT_PAGE_ID: "0123456789abcdef0123456789abcdef",
  SOURCE_DB_PATH: "/tmp/source.db",
})

describe("loadConfig", () => {
  // ---- 正常系 ----

  it("TC-01: 全必須変数 + 任意変数を指定すると全値を返す", () => {
    // 【テスト目的】必須+任意がすべて揃った場合に正しく構成オブジェクトを返すこと
    // 【テスト内容】PORT/APP_DB_PATH も明示指定して loadConfig を呼ぶ
    // 【期待される動作】指定どおりの値（PORT は number）が返る
    const env = { ...validEnv(), PORT: "4000", APP_DB_PATH: "data/custom.db" }
    const config = loadConfig(env)
    expect(config.NOTION_API_TOKEN).toBe("ntn_dummy_token_for_test")
    expect(config.NOTION_PARENT_PAGE_ID).toBe(
      "0123456789abcdef0123456789abcdef",
    )
    expect(config.SOURCE_DB_PATH).toBe("/tmp/source.db")
    expect(config.PORT).toBe(4000)
    expect(config.APP_DB_PATH).toBe("data/custom.db")
  })

  it("TC-02: PORT 未指定なら既定 3939 を適用する", () => {
    // 【テスト目的】PORT 既定値の適用（完了条件）
    // 【テスト内容】PORT を渡さずに loadConfig を呼ぶ
    // 【期待される動作】PORT が DEFAULT_PORT(3939) になる
    const config = loadConfig(validEnv())
    expect(config.PORT).toBe(3939)
    expect(DEFAULT_PORT).toBe(3939)
  })

  it("TC-03: APP_DB_PATH 未指定なら既定 data/app.db を適用する", () => {
    // 【テスト目的】APP_DB_PATH 既定値の適用（完了条件）
    // 【テスト内容】APP_DB_PATH を渡さずに loadConfig を呼ぶ
    // 【期待される動作】APP_DB_PATH が data/app.db になる
    const config = loadConfig(validEnv())
    expect(config.APP_DB_PATH).toBe("data/app.db")
    expect(DEFAULT_APP_DB_PATH).toBe("data/app.db")
  })

  it("TC-04: PORT を文字列で指定すると number に変換する", () => {
    // 【テスト目的】PORT の型変換
    // 【テスト内容】PORT="5050" を渡す
    // 【期待される動作】number 5050 が返る
    const config = loadConfig({ ...validEnv(), PORT: "5050" })
    expect(config.PORT).toBe(5050)
    expect(typeof config.PORT).toBe("number")
  })

  // ---- 異常系 ----

  it("TC-05: NOTION_API_TOKEN 欠落でエラー（キー名を含む）", () => {
    // 【テスト目的】必須欠落で起動エラー（完了条件）
    // 【テスト内容】NOTION_API_TOKEN を除いた env で呼ぶ
    // 【期待される動作】Error がスローされ、メッセージに欠落キー名を含む
    const env = validEnv()
    delete env.NOTION_API_TOKEN
    expect(() => loadConfig(env)).toThrow(/NOTION_API_TOKEN/)
  })

  it("TC-06: 複数必須欠落で全キー名を列挙する", () => {
    // 【テスト目的】欠落キーの網羅報告
    // 【テスト内容】NOTION_API_TOKEN と SOURCE_DB_PATH を除く
    // 【期待される動作】両キー名がメッセージに含まれる
    const env = validEnv()
    delete env.NOTION_API_TOKEN
    delete env.SOURCE_DB_PATH
    expect(() => loadConfig(env)).toThrow(/NOTION_API_TOKEN/)
    expect(() => loadConfig(env)).toThrow(/SOURCE_DB_PATH/)
  })

  it("TC-07: 必須変数が空文字なら未設定扱いでエラー", () => {
    // 【テスト目的】空文字を欠落として扱う
    // 【テスト内容】NOTION_PARENT_PAGE_ID を空文字に
    // 【期待される動作】Error がスローされる
    const env = { ...validEnv(), NOTION_PARENT_PAGE_ID: "" }
    expect(() => loadConfig(env)).toThrow(/NOTION_PARENT_PAGE_ID/)
  })

  it("TC-08: PORT が非数値ならエラー", () => {
    // 【テスト目的】不正な PORT の早期検出
    // 【テスト内容】PORT="abc"
    // 【期待される動作】Error がスローされる
    expect(() => loadConfig({ ...validEnv(), PORT: "abc" })).toThrow(/PORT/)
  })

  it("TC-09: PORT が範囲外ならエラー（境界）", () => {
    // 【テスト目的】PORT の範囲検証（1-65535）
    // 【テスト内容】0 と 70000 は無効、1 と 65535 は有効
    // 【期待される動作】範囲外は throw、境界内は成功
    expect(() => loadConfig({ ...validEnv(), PORT: "0" })).toThrow(/PORT/)
    expect(() => loadConfig({ ...validEnv(), PORT: "70000" })).toThrow(/PORT/)
    expect(loadConfig({ ...validEnv(), PORT: "1" }).PORT).toBe(1)
    expect(loadConfig({ ...validEnv(), PORT: "65535" }).PORT).toBe(65535)
  })

  // ---- セキュリティ ----

  it("TC-FULL-MODE: BEAM_DASHBOARD_MODE 未指定なら mode=full", () => {
    // 【テスト目的】既定が full モードであること（後方互換）
    // 【テスト内容】BEAM_DASHBOARD_MODE を指定せず loadConfig
    // 【期待される動作】mode === "full"
    expect(loadConfig(validEnv()).mode).toBe("full")
  })

  // ---- view モード（beam ダッシュボード） ----

  it("TC-VIEW-01: view モードは Notion env なし・SOURCE_DB_PATH なしでも起動できる", () => {
    // 【テスト目的】ビューア専用モードはゼロ設定で起動可能（Notion 不要）
    // 【テスト内容】BEAM_DASHBOARD_MODE=view のみ（NOTION_*/SOURCE_DB_PATH なし）で loadConfig
    // 【期待される動作】例外を投げず、mode=view・SOURCE_DB_PATH は既定 data/tasks.db
    const config = loadConfig({ BEAM_DASHBOARD_MODE: "view" })
    expect(config.mode).toBe("view")
    expect(config.SOURCE_DB_PATH).toBe(DEFAULT_SOURCE_DB_PATH)
    expect(config.SOURCE_DB_PATH).toBe("data/tasks.db")
    expect(config.PORT).toBe(DEFAULT_PORT)
  })

  it("TC-VIEW-02: view モードでも SOURCE_DB_PATH を明示指定すれば優先される", () => {
    // 【テスト目的】既定より明示指定を優先
    // 【テスト内容】BEAM_DASHBOARD_MODE=view + SOURCE_DB_PATH 指定
    // 【期待される動作】指定値が使われる
    const config = loadConfig({
      BEAM_DASHBOARD_MODE: "view",
      SOURCE_DB_PATH: "/custom/tasks.db",
    })
    expect(config.SOURCE_DB_PATH).toBe("/custom/tasks.db")
  })

  it("TC-10: 検証失敗時のエラーにトークン値が含まれない", () => {
    // 【テスト目的】シークレット非露出（P0 / NFR-104）（完了条件）
    // 【テスト内容】トークンを設定しつつ別の必須を欠落させる
    // 【期待される動作】Error メッセージにトークン文字列が一切含まれない
    const secret = "ntn_super_secret_value_should_not_leak"
    const env: NodeJS.ProcessEnv = {
      ...validEnv(),
      NOTION_API_TOKEN: secret,
    }
    delete env.SOURCE_DB_PATH
    try {
      loadConfig(env)
      throw new Error("loadConfig should have thrown")
    } catch (e) {
      const message = (e as Error).message
      expect(message).not.toContain(secret)
      expect(message).toContain("SOURCE_DB_PATH")
    }
  })
})

// process.env 経由の薄いラッパも検証する（実際の利用経路）。
describe("loadConfigFromProcess", () => {
  const original = { ...process.env }
  beforeEach(() => {
    process.env = { ...original }
  })
  afterEach(() => {
    process.env = original
  })

  it("TC-11: process.env から読み込み PORT が number 型になる", async () => {
    // 【テスト目的】実利用経路（process.env）の動作
    // 【テスト内容】process.env に必須値をセットして呼ぶ
    // 【期待される動作】PORT が number で返る
    const { loadConfigFromProcess } = await import("./env.js")
    process.env.NOTION_API_TOKEN = "ntn_dummy"
    process.env.NOTION_PARENT_PAGE_ID = "0123456789abcdef0123456789abcdef"
    process.env.SOURCE_DB_PATH = "/tmp/source.db"
    delete process.env.PORT
    const config = loadConfigFromProcess()
    expect(typeof config.PORT).toBe("number")
    expect(config.PORT).toBe(3939)
  })
})
