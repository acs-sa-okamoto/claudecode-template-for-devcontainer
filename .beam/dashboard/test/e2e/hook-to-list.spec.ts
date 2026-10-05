// E2E: hook 受信 → 一覧反映（TASK-0026 / TC-E2E-01 / NFR-007・AC-01/02）。
//
// 【テスト目的】hook を複数件投入すると、投入したすべてのタスクが一覧へ反映されること
//   （NFR-007 の 100% 成功）と、通知 ON 時にトースト発火（spawn スタブ）が走ることを確認する。
// 【テスト内容】3 タスクをソース DB に用意し、各 taskId で hook を POST → 一覧再読込。
// 【期待される動作】3 行すべてが task-row として現れ、実 Notion / 実 powershell は呼ばれない。

import { expect, test } from "@playwright/test"
import { startTestServer, type TestServer } from "./fixtures.js"

let server: TestServer

test.afterEach(async () => {
  await server?.close()
})

test("TC-E2E-01: hook 複数件投入で全タスクが一覧に反映される（100%）", async ({
  page,
}) => {
  server = await startTestServer({
    alpha: [
      { taskId: 1, title: "タスクA", status: "ready" },
      { taskId: 2, title: "タスクB", status: "in_progress" },
      { taskId: 3, title: "タスクC", status: "done" },
    ],
  })

  // hook を 3 件投入（added）。各 POST は 200 を返すはず。
  for (const taskId of [1, 2, 3]) {
    const res = await server.postHook({ type: "added", project: "alpha", taskId })
    expect(res.status).toBe(200)
  }

  await page.goto(server.baseUrl)

  // 一覧（GET /api/tasks）はソース DB を読むため、3 行すべてが現れる。
  await expect(page.getByTestId("task-row")).toHaveCount(3)
  await expect(page.getByTestId("row-title")).toContainText([
    "タスクA",
    "タスクB",
    "タスクC",
  ])

  // 通知 ON（既定）→ 5 秒集約後にトースト発火（spawn スタブ）が 1 回以上。
  await expect
    .poll(() => server.calls.toastCounts.length, { timeout: 8000 })
    .toBeGreaterThan(0)

  // EDGE-005: 実 Notion fetch / 実 powershell.exe は呼ばれていない。
  expect(server.calls.createPage).toBe(0)
  expect(server.calls.realSpawn).toBe(0)
})
