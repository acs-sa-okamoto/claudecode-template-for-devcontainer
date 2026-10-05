// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import type { ApiResponse } from "../../shared/index.js"
import { createNotificationToggle } from "./notification.js"

// notificationsEnabled を返す fetch スタブ。
function stubFetch(
  responder: (input: string, init?: RequestInit) => boolean,
): typeof fetch {
  return vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
    const enabled = responder(input, init)
    const body: ApiResponse<{ notificationsEnabled: boolean }> = {
      success: true,
      data: { notificationsEnabled: enabled },
    }
    return { json: async () => body }
  }) as unknown as typeof fetch
}

describe("createNotificationToggle", () => {
  it("TC-02: init で GET の値をトグルへ反映する", async () => {
    // 【テスト目的】初期状態をサーバから取得して反映（AC-16）
    const toggle = createNotificationToggle({
      fetchImpl: stubFetch(() => true),
    })
    await toggle.init()
    expect(toggle.input.checked).toBe(true)
    expect(toggle.input.disabled).toBe(false)
  })

  it("TC-01/TC-E2E-01: 切替で POST /api/notifications が新状態で呼ばれる", async () => {
    // 【テスト目的】トグル操作で POST 更新（AC-16）
    const calls: Array<{ url: string; body: unknown }> = []
    const fetchImpl = stubFetch((url, init) => {
      if (init?.method === "POST") {
        calls.push({ url, body: JSON.parse(String(init.body)) })
      }
      // POST されたら true（チェック）を返す
      return true
    })
    const toggle = createNotificationToggle({ fetchImpl })
    await toggle.init()
    toggle.input.checked = true
    toggle.input.dispatchEvent(new Event("change"))
    // change 内の非同期処理を解決
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls.length).toBe(1)
    expect(calls[0]?.url).toBe("/api/notifications")
    expect(calls[0]?.body).toEqual({ enabled: true })
  })

  it("TC-E01: POST 失敗時にトグルが元に戻る", async () => {
    // 【テスト目的】更新失敗時のロールバック（UI/UX）
    const fetchImpl = vi
      .fn()
      .mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          // 失敗応答
          return {
            json: async () => ({
              success: false,
              error: { code: "VALIDATION_ERROR", message: "ng" },
            }),
          }
        }
        return {
          json: async () => ({
            success: true,
            data: { notificationsEnabled: false },
          }),
        }
      }) as unknown as typeof fetch
    const onError = vi.fn()
    const toggle = createNotificationToggle({ fetchImpl, onError })
    await toggle.init()
    expect(toggle.input.checked).toBe(false)
    toggle.input.checked = true
    toggle.input.dispatchEvent(new Event("change"))
    // change 内の Promise チェーン（json() 含む）を確実に解決させる
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(toggle.input.checked).toBe(false) // 元に戻る
    expect(onError).toHaveBeenCalledTimes(1)
  })
})
