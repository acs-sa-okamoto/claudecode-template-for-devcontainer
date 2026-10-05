// Playwright E2E 設定（TASK-0026 / Phase 6）。
//
// vitest（単体・統合）とは別ランナーで E2E を回す（`pnpm test:e2e`）。
// サーバはテストプロセス内（in-process）で起動し、外部依存（Notion / powershell）のみ
// スタブ化する。スタブ状態をテストとサーバで共有するため、別プロセス（webServer）は使わず
// 各 spec が fixtures の startTestServer でサーバを立てる。
//
// Chromium（headless）はコンテナで起動可能（TASK-0026 phase0 で実機確認済み）。

import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./test/e2e",
  // 各 spec が独自にサーバを立て・落とすため、ファイル間の状態共有を避け直列実行する。
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "line" : [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    // baseURL は各 spec が起動時ポートで上書きする（page.goto に絶対 URL を渡す）。
    headless: true,
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
