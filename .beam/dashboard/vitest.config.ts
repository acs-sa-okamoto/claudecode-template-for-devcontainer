import { defineConfig } from "vitest/config"

// vite.config.ts は root を src/web に設定するため、テスト用に独立した設定を用意する。
// テストはプロジェクト全体（主に src/server）を対象とする。
export default defineConfig({
  test: {
    root: ".",
    include: ["src/**/*.{test,spec}.ts"],
    // 既定はサーバー向けの node 環境。フロント（src/web）の各テストは
    // ファイル先頭の `// @vitest-environment jsdom` で jsdom に切り替える。
    environment: "node",
  },
})
