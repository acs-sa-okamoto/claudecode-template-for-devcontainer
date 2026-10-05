import { resolve } from "node:path"
import { defineConfig } from "vite"

// フロントエンド（src/web の vanilla TS/HTML）を dist/web へビルドする。
// Hono の静的配信対象（dist/web）に出力し、サーバービルド（tsc → dist/server）と分離する。
export default defineConfig({
  root: resolve(__dirname, "src/web"),
  publicDir: false,
  build: {
    outDir: resolve(__dirname, "dist/web"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "src/web/index.html"),
    },
  },
  server: {
    // 開発時のみ。本番は Hono が dist/web を配信する。
    host: "127.0.0.1",
  },
})
