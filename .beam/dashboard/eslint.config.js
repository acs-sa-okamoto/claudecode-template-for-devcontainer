import js from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".beam/**",
      "node_modules/**",
      "coverage/**",
      "docs/**",
      "*.config.js",
      "*.config.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      semi: ["error", "never"],
      // 文字列内に二重引用符を含む場合は単一引用符を許可（エスケープ回避）
      quotes: ["error", "double", { avoidEscape: true }],
      // any を避ける方針（CLAUDE.md / TASK-0001）
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
)
