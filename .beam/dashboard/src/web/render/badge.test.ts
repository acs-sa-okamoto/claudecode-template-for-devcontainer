// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import type { NotionSyncStatus, TaskStatus } from "../../shared/index.js"
import {
  renderStatusBadge,
  renderSyncBadge,
  STATUS_LABEL,
  SYNC_LABEL,
} from "./badge.js"

describe("renderStatusBadge", () => {
  it("TC-01: 各 status の日本語ラベルを表示する", () => {
    // 【テスト目的】status 4 値が日本語バッジになる（REQ-403）
    // 【テスト内容】全 status を描画しラベルを確認
    // 【期待される動作】固定マップ通りの日本語
    const cases: TaskStatus[] = ["ready", "in_progress", "in_review", "done"]
    for (const s of cases) {
      const badge = renderStatusBadge(s)
      expect(badge.textContent).toBe(STATUS_LABEL[s])
      expect(badge.classList.contains(`badge--status-${s}`)).toBe(true)
    }
  })

  it("TC-E01: 未知の status はフォールバックラベルで安全に表示", () => {
    const badge = renderStatusBadge("weird-value")
    expect(badge.textContent).toBe("不明")
  })
})

describe("renderSyncBadge", () => {
  it("TC-02: 各 notion_sync_status の日本語ラベルを表示する", () => {
    // 【テスト目的】sync 5 値が日本語バッジになる（REQ-404）
    const cases: NotionSyncStatus[] = [
      "not_synced",
      "syncing",
      "synced",
      "pending_deletion",
      "sync_failed",
    ]
    for (const s of cases) {
      const badge = renderSyncBadge(s)
      expect(badge.textContent).toBe(SYNC_LABEL[s])
      expect(badge.classList.contains(`badge--sync-${s}`)).toBe(true)
    }
  })
})
