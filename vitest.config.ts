import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // 除外は明示列挙する。`configDefaults` の形は Vitest のバージョンで変わり
    // （3.2.7 では configDefaults.test が undefined）、参照すると起動時に落ちる。
    exclude: [
      "**/node_modules/**",
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
