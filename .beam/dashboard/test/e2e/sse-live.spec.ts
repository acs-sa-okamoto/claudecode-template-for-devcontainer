// E2E: SSE ライブ更新（TASK-0026 / TC-E2E-05 / AC-12）。
//
// 【テスト目的】一覧表示中（SSE 接続中）に新規 hook が到着すると、リロード操作なしで
//   一覧が自動更新され、該当行がハイライト（.row--updated）されることを確認する。
// 【テスト内容】最初に 1 件だけソースに置いて表示 → その後 2 件目を hook（updated）。
//   実際にはソース DB を後から増やせないため、初期に 2 件置きつつ片方は最初の描画で出す。
//   SSE による「自動 reload + 変更行ハイライト」を、hook 経由の update_badge と broadcast で検証する。
// 【期待される動作】hook 受信後、当該行に row--updated クラスが付く（手動リロードなし）。

import { expect, test } from "@playwright/test"
import { startTestServer, type TestServer } from "./fixtures.js"

let server: TestServer

test.afterEach(async () => {
  await server?.close()
})

test("TC-E2E-05: SSE 接続中の hook 受信で一覧が自動更新され変更行がハイライトされる", async ({
  page,
}) => {
  server = await startTestServer({
    delta: [
      { taskId: 1, title: "既存タスク", status: "ready" },
      { taskId: 2, title: "更新されるタスク", status: "ready" },
    ],
  })

  await page.goto(server.baseUrl)
  await expect(page.getByTestId("task-row")).toHaveCount(2)

  // SSE が接続されるのを待つ（EventSource が開く）。クライアント数で確認する代わりに
  // 一覧描画完了を待ってから hook を投げる。
  const targetRow = page
    .getByTestId("task-row")
    .filter({ hasText: "更新されるタスク" })
  await expect(targetRow).toHaveCount(1)

  // 新規 hook（updated）を投入 → サーバが update_badge=1 を立て、SSE で tasks_changed を broadcast。
  // フロントは受信して自動 reload し、update_badge の行に row--updated を付ける（手動リロードなし）。
  const res = await server.postHook({
    type: "updated",
    project: "delta",
    taskId: 2,
  })
  expect(res.status).toBe(200)

  // リロード操作をせずに、該当行へ row--updated が付くのを待つ（Playwright 自動待機）。
  await expect(
    page.getByTestId("task-row").filter({ hasText: "更新されるタスク" }),
  ).toHaveClass(/row--updated/, { timeout: 10000 })

  // 実 powershell.exe は呼ばれていない。
  expect(server.calls.realSpawn).toBe(0)
})
