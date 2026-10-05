// E2E: 削除フロー（TASK-0026 / TC-E2E-04 / AC-13/14/15）。
//
// 【テスト目的】synced タスクをソース DB から消すと pending_deletion になり、削除同期で
//   Notion 削除（スタブ）後に一覧から消えることを確認する。
// 【テスト内容】synced メタを持つタスクを用意 → ソース DB から該当行を削除した状態で
//   一覧を開く（task-merger が pending_deletion 化）→ delete-sync-button をクリック。
// 【期待される動作】deletePage が 1 回呼ばれ、reload 後に当該行が消える。

import { expect, test } from "@playwright/test"
import { startTestServer, type TestServer } from "./fixtures.js"

let server: TestServer

test.afterEach(async () => {
  await server?.close()
})

test("TC-E2E-04: synced 削除 → pending_deletion → Notion 削除後に一覧から消える", async ({
  page,
}) => {
  // ソース DB には「残す 1 件」のみ用意し、削除対象 taskId=2 は最初から source に置かない。
  // メタには synced 行（taskId=2）を仕込む → mergeTasks が「ソース消失 + synced」を検知して
  // pending_deletion へ遷移させる（snapshot で取り消し線表示）。
  server = await startTestServer({
    gamma: [{ taskId: 1, title: "残すタスク", status: "ready" }],
  })

  // 削除対象: synced・notion_page_id 付き（Notion 上に存在）。ソース DB には taskId=2 が
  // 無いため、初回一覧取得で mergeTasks が synced→pending_deletion へ遷移させる（REQ-105）。
  server.seedMeta({
    project: "gamma",
    taskId: 2,
    notionSyncStatus: "synced",
    notionPageId: "page-existing-2",
  })

  await page.goto(server.baseUrl)

  // pending_deletion 行（削除待ち）が表示され、削除同期ボタンが出る。
  const delRow = page.getByTestId("task-row").filter({ has: page.getByTestId("delete-sync-button") })
  await expect(delRow).toHaveCount(1)
  await expect(delRow.getByTestId("sync-badge")).toHaveText("削除待ち")

  // 削除同期を実行。
  await delRow.getByTestId("delete-sync-button").click()

  // reload 後、当該行が一覧から消える（メタ削除）。残るのは taskId=1 のみ。
  await expect(page.getByTestId("task-row")).toHaveCount(1)
  await expect(page.getByTestId("row-title")).toHaveText("残すタスク")

  // Notion スタブ: archive（deletePage）が 1 回。実 powershell 不使用。
  expect(server.calls.deletePage).toBe(1)
  expect(server.calls.realSpawn).toBe(0)
})
