# rules（tdd-implement 共通ルール）

## 入出力パス（beam 現行規約に整合）

### 入力（読み込む）

| パス | 内容 | 生成元 |
|---|---|---|
| `docs/tasks/{要件名}/TASK-XXXX.md` | 実装対象タスク（完了条件・実装詳細・テスト要件） | beam4 |
| `docs/tasks/{要件名}/overview.md` | フェーズ・依存の全体像 | beam4 |
| `data/tasks.db`（テーブル=`{要件名}`） | タスクの status / blocked_by / task_type | beam4 |
| `docs/spec/{要件名}/requirements.md` | 要件定義（EARS） | beam2 |
| `docs/spec/{要件名}/acceptance-criteria.md` | 受け入れ基準 | beam2 |
| `docs/spec/{要件名}/feature-requirements.md` | 機能要求（**power の場合**。requirements / acceptance-criteria の代替。FR・AC を含む） | power1 |
| `docs/spec/{要件名}/design/`（`architecture.md` / `dataflow.md` / `interfaces.ts` / `database-schema.sql` / `api-endpoints.md`） | 設計契約 | beam3 |
| `docs/spec/{要件名}/note.md` | 技術スタック・規約・関連実装 | beam1 |
| `docs/rule/ai-security-guardrails.md` | セキュリティ P0/P1 | プロジェクト |
| `CLAUDE.md` | 規約・コマンド・DoD | プロジェクト |

### 出力（書き出す）

| パス | 内容 |
|---|---|
| プロジェクトのソースツリー（`src/` 等） | テストコード・実装コード（**構造は note.md / architecture.md に従う**） |
| `docs/implements/{要件名}/{TASK-ID}/requirements.md` | TDD用に詳細化した要件 |
| `docs/implements/{要件名}/{TASK-ID}/testcases.md` | テストケース一覧 |
| `docs/implements/{要件名}/{TASK-ID}/memo.md` | red/green/refactor の作業ログ（フェーズごとに追記） |
| `docs/implements/{要件名}/{TASK-ID}/verify-report.md` | 完全性検証レポート |

> **設計判断**: tsumiki 由来の「フェーズごとに別ドキュメント」を、**1本の running memo（memo.md）に集約**した。red/green/refactor の記録は memo.md に追記する（ドキュメント乱立を防ぐ）。requirements / testcases / verify-report は性質が異なるため独立ファイルとする。

### ファイルパスの記載ルール

- **プロジェクトルートを基準とした相対パスを使用する**（絶対パス禁止）
- 例: ❌ `/Users/name/app/src/x.ts` → ✅ `src/x.ts`

## 信頼性レベル指示

各項目について、情報源（要件定義書・設計文書・受け入れ基準・ユーザヒアリング）との照合状況を以下でコメントする：

- 🔵 **青信号**: 情報源に明示的な記載があり、ほぼ推測していない
- 🟡 **黄信号**: 情報源から妥当に推測できる
- 🔴 **赤信号**: 情報源に無い推測

## コードコメントの方針（日本語）

- **テストコード（必須）**: 次の3点を冒頭に記す（検証意図の共有のため）：
  - **【テスト目的】**: 何を確認するか
  - **【テスト内容】**: どんな入力で何を検証するか
  - **【期待される動作】**: 期待結果
- **実装コード**: コメントは**背景（なぜ）だけ**を書く（coding-principles **A-1**）。実装の直訳・逐次説明コメントは書かない。コードで表せることは命名・構造（A-2〜A-5）で表す。
- コーディング原則の出典: `code-review/references/coding-principles.md`（解決順: リポジトリ直下 `.claude/skills/` → `~/.claude/skills/`）。Refactor フェーズのチェックリストとして使う。

## 禁止事項（実装の品質ガード）

- **モック・スタブ・インメモリDBで「通しただけ」にしない**（Green フェーズ）。実データ・実DBで動作させる。テスト用フィクスチャは可だが、本番ロジックの省略・ごまかしは禁止
- **DB アクセス等の重要処理を省略しない**
- セキュリティ（`docs/rule/ai-security-guardrails.md` の P0）を必ず遵守する。適用外と判断した規則は理由を一言述べる

## ファイルサイズの目安

- 実装ファイルが肥大化したら適切に分割する（目安: 1ファイル 500〜800 行以内）
- 分割時は責務単位で分け、code-map（beam5 管理）や memo.md に記録する

## 品質判定基準

```
✅ 高品質:
- すべてのテストが通る
- 要件網羅率が高い（受け入れ基準を満たす）
- 信頼性レベル: 🔵 が多い
- セキュリティ P0 違反なし

⚠️ 要改善:
- 一部テストが失敗 / 要件の取りこぼし
- 推測（🟡🔴）が多い
- リファクタ余地が大きい
```

## E2E・統合テストの優先

- UI を伴う機能は **E2E テスト（Playwright 等）を優先**して設計する
- 単体テストだけでなく、受け入れ基準（acceptance-criteria.md）に対応する統合的な検証を含める

## tasks.db との連携

- 実装開始時: 対象タスクを `status = 'in_progress'`
- verify 完了時（完全達成）: `status = 'done'`、`update_badge = 1`
- 検証で未達なら `in_progress` のまま、不足を verify-report.md と memo.md に記録
- 日時は JST（`datetime('now', '+9 hours')`）。`sqlite3` が無い環境では status 更新を省略し、overview.md のチェックボックスで管理

## ダッシュボードへのライブ通知（任意・best-effort）

beam ダッシュボード（task-bridge ビューア）が起動している場合、**タスクの status を更新した直後**に hook を1回叩くと、一覧がリアルタイムに更新される（SSE）＋トースト通知が出る。**起動していなくても実装は続行する**（best-effort、失敗は無視）。

```bash
# status を in_progress / done に更新した直後などに（PORT は既定 3939）
curl -s -m 2 -X POST http://127.0.0.1:${BEAM_DASHBOARD_PORT:-3939}/api/hook \
  -H 'content-type: application/json' \
  -d '{"type":"status_changed","project":"{要件名}","taskId":"{TASK-ID}"}' >/dev/null 2>&1 || true
```

- `project` = 要件名（tasks.db のテーブル名）、`taskId` = `TASK-XXXX`
- ダッシュボード未起動・接続失敗時は黙って無視（タイムアウト 2 秒）
