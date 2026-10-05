# 理解ブリーフ（Understanding Brief）出力テンプレート

このファイルは `power2-understand` スキルが `understanding-brief.md` を生成する際に参照する書式の定義です。後続の `power3-design` が拠り所にするため、以下を厳密に守ること。

**信頼性レベル**（全項目に付す）: 🔵 確実（実コードで確認済）／🟡 妥当な推測（要確認）／🔴 推測。
power1-scope の 🟡[C] 候補を実コードで検証して 🔵 に昇格させたものは、根拠（`file:line`）を必ず添える。

---

## 出力テンプレート

以下に従って `docs/spec/{機能名}/understanding-brief.md` を生成する。`[...]` は実際の内容で置き換える。

````markdown
# 理解ブリーフ（Understanding Brief）

**機能名:** [kebab-case-name]
**対象リポジトリ:** [repo 名]
**作成日:** YYYY-MM-DD
**入力:** docs/spec/[機能名]/feature-requirements.md
**プロジェクト種別:** [beam / 一般]
**ドキュメント信頼度:** [高（型/スキーマ/OpenAPI/テスト） / 中（手書きアーキ） / 低（散文/無）]

---

## 1. 統合面（確定した統合点）

> 変更が接続・依存する既存コード。feature-requirements の INT を **実コードで検証・確定**したもの。

| ID | 接続先 | 場所 (file:line) | 契約・シグネチャ | 信頼性 |
|---|---|---|---|---|
| INT-01 | [既存モジュール/API/画面/データ] | `src/...:NN` | `[実シグネチャ]` | 🔵 |

**見本:**

| ID | 接続先 | 場所 (file:line) | 契約・シグネチャ | 信頼性 |
|---|---|---|---|---|
| INT-01 | タスク一覧コンポーネント | `src/web/taskList.tsx:120` | `<TaskList items={Task[]} />`。ボタンをツールバーに追加 | 🔵 |
| INT-02 | タスク取得関数 | `src/db/taskRepo.ts:45` | `listTasks(filter: Filter): Promise<Task[]>` を再利用 | 🔵 |

---

## 2. 踏襲すべき規約・パターン

> この機能の実装が合わせるべき既存の書き方。代表例を `file:line` で示す。

**見本:**
- エラー処理: `Result<T, E>` 型を返す（例外を投げない）。`src/db/taskRepo.ts:30` 参照。🔵
- 命名: 関数は camelCase、ファイルは camelCase.ts。🔵
- UI: 既存ボタンは `<Button variant=...>` を使う。`src/web/components/Button.tsx`。🔵

---

## 3. データモデル・スキーマの現状

> 関係するテーブル・型の現状。変更が必要かは power3 設計で決定する（ここでは現状把握のみ）。

**見本:**
- `tasks` テーブル: `task_id INTEGER PK, title TEXT, status TEXT, ...`（`src/db/schema.sql:1`）。🔵
- この機能は読み取りのみで、スキーマ変更は不要の見込み。🟡（設計で最終判断）

---

## 4. 影響範囲・回帰リスク（blast radius）

> 変更で影響しうる既存機能。feature-requirements の REG を **実コードで拡張・確定**。power6 の回帰検証の入力。

| ID | 影響しうる既存機能 | 根拠 (file:line) | 検証方法 | 信頼性 |
|---|---|---|---|---|
| REG-01 | [既存機能] | `src/...:NN` | [回帰の確認方法] | 🟡 |

**見本:**

| ID | 影響しうる既存機能 | 根拠 (file:line) | 検証方法 | 信頼性 |
|---|---|---|---|---|
| REG-01 | 一覧の描画速度 | `src/web/taskList.tsx:120` | 1000件表示の速度が既存 NFR を維持するか実測 | 🟡 |
| REG-02 | フィルタ機能 | `src/web/filter.ts:20` | フィルタ後件数とエクスポート件数が一致するかテスト | 🔵 |

---

## 5. リスク・未解決の論点

> 設計（power3）の前に解消すべき疑問。ユーザー確認が要るものは明記する。

**見本:**
- 大量件数（1万件超）のエクスポートはスコープ外か要確認（feature-requirements では1000件想定）。🟡
- 既存に CSV 生成のユーティリティがあるか未確認（重複実装回避のため power3 で再探索）。🟡

---

## 6. 参照した code-map

- `docs/code-map.md`（このブリーフ作成時に生成/更新済み）
````
