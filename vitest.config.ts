import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // 除外は明示して並べる。`exclude` を書くと Vitest の既定の除外（`configDefaults.exclude`。
    // 5 系では node_modules と .git だけ）が置き換わるので、既定の分もここに書く。
    // （`configDefaults.test` というものは無い。除外の既定は `configDefaults.exclude`）
    exclude: [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      // .beam/dashboard は独自の package.json / 依存 / vitest 設定を持つ別プロジェクト。
      // 除外しないとルートの `pnpm test` がダッシュボードのテストを拾い、
      // ルートに無い依存（@hono/node-server 等）の解決に失敗して必ず落ちる。
      ".beam/**",
    ],
    // スターター状態ではテストが1件も無い。テスト不在を失敗にしないことで、
    // CLAUDE.md の完了条件「テスト・型チェック・Lint がすべて成功」を
    // プロジェクト開始時点から満たせる状態にする。
    passWithNoTests: true,
  },
})
