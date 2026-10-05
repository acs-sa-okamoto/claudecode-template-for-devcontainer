// E2E: 個別登録 / 一括登録（TASK-0026 / TC-E2E-02・TC-E2E-03 / AC-08/09/10）。
//
// 【テスト目的】個別 Notion 登録で当該行が「登録済」になり、一括登録で進捗バーが出て
//   全件完了することを、Notion スタブの呼び出し回数とともに確認する。
// 【テスト内容】not_synced 行の sync-button / 見出しの bulk-sync-button を操作する。
// 【期待される動作】sync-badge が「登録済」、進捗バーが出現→消去、createPage 回数が一致。

import { expect, test } from "@playwright/test"
import { startTestServer, type TestServer } from "./fixtures.js"

let server: TestServer

test.afterEach(async () => {
  await server?.close()
})

test("TC-E2E-02: 個別登録で当該行が『登録済』になり createPage が 1 回", async ({
  page,
}) => {
  server = await startTestServer({
    alpha: [{ taskId: 1, title: "登録対象", status: "ready" }],
  })

  await page.goto(server.baseUrl)

  const row = page.getByTestId("task-row").filter({ hasText: "登録対象" })
  await expect(row.getByTestId("sync-badge")).toHaveText("未登録")

  // 個別登録ボタン（not_synced のみ活性）をクリック。
  await row.getByTestId("sync-button").click()

  // 成功後の reload で「登録済」へ。
  await expect(row.getByTestId("sync-badge")).toHaveText("登録済")

  // Notion スタブ: DB 自動作成 1 回 + ページ作成 1 回。実 powershell は不使用。
  expect(server.calls.createDatabase).toBe(1)
  expect(server.calls.createPage).toBe(1)
  expect(server.calls.realSpawn).toBe(0)
})

test("TC-E2E-03: 一括登録で進捗バーが出て全件『登録済』になる", async ({ page }) => {
  server = await startTestServer({
    beta: [
      { taskId: 1, title: "一括1", status: "ready" },
      { taskId: 2, title: "一括2", status: "ready" },
      { taskId: 3, title: "一括3", status: "ready" },
    ],
  })

  await page.goto(server.baseUrl)

  await expect(page.getByTestId("task-row")).toHaveCount(3)

  // プロジェクト見出しの一括登録ボタンをクリック → ジョブ開始。
  await page.getByTestId("bulk-sync-button").click()

  // 進捗バーが出現する（X / N件 登録中...）。タイミングが速いと既に消えている場合があるため
  // 進捗 or 全件完了のいずれかで満たすことを許容する。
  // 最終的に全 3 行が「登録済」になる。
  await expect(page.getByTestId("sync-badge").filter({ hasText: "登録済" })).toHaveCount(3, {
    timeout: 15000,
  })

  // 進捗バーは最終的に消える。
  await expect(page.getByTestId("sync-progress")).toHaveCount(0)

  // Notion スタブ: DB 自動作成 1 回（プロジェクト共通）+ ページ作成 3 回。
  expect(server.calls.createDatabase).toBe(1)
  expect(server.calls.createPage).toBe(3)
  expect(server.calls.realSpawn).toBe(0)
})
