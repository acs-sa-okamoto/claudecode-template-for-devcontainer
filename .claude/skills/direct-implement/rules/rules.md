# rules（direct-implement 共通ルール）

DIRECT タスク = 環境構築・設定ファイル作成・依存インストール・ビルド設定・ドキュメント整備など、**テスト駆動になじまない準備系の作業**。

## 入出力パス（beam 現行規約に整合）

### 入力（読み込む）

| パス | 内容 | 生成元 |
|---|---|---|
| `docs/tasks/{要件名}/TASK-XXXX.md` | 実装対象タスク（task_type=DIRECT） | beam4 |
| `data/tasks.db`（テーブル=`{要件名}`） | status / task_type | beam4 |
| `docs/spec/{要件名}/design/architecture.md` / `database-schema.sql` | 構成・DB初期化情報 | beam3 |
| `docs/spec/{要件名}/feature-requirements.md` | 機能要求（**power の場合**。要件・受け入れ条件の原典） | power1 |
| `docs/spec/{要件名}/note.md` | 技術スタック・規約 | beam1 |
| `docs/tech-stack.md` | 技術スタック（存在する場合） | プロジェクト |
| `docs/rule/ai-security-guardrails.md` | セキュリティ P0/P1 | プロジェクト |
| `CLAUDE.md` / `README.md` | 規約・コマンド・手順 | プロジェクト |

### 出力（書き出す）

| パス | 内容 |
|---|---|
| 設定ファイル・環境ファイル等 | プロジェクト構造に従って配置 |
| `docs/implements/{要件名}/{TASK-ID}/setup-report.md` | セットアップ作業の記録 |
| `docs/implements/{要件名}/{TASK-ID}/verify-report.md` | 動作確認の記録 |
| `README.md`（更新） | 環境変数・設定手順・トラブルシューティングを追記 |
| `CLAUDE.md`（更新） | 開発コマンド（テスト・起動等）を追記 |

### ファイルパスの記載ルール

- **プロジェクトルートを基準とした相対パスを使用する**（絶対パス禁止）

## セキュリティ（P0 厳守）

- `docs/rule/ai-security-guardrails.md` を読み、P0 を遵守する
- **シークレット（APIキー・トークン）を直書きしない**。`.env` 等で管理し、必要な値は `docs/spec/{要件名}/prep.md`（beam2 のユーザー準備タスク）に列挙されている前提で扱う。ダミー値や仮キーを埋め込まない
- `.env` や秘密情報を Git に含めない（`.gitignore` を確認・整備）

## ドキュメント更新の必須化

- **setup でやったこと**は README.md（環境変数・設定・トラブルシューティング）に反映する
- **verify で判明した開発コマンド**（テスト実行・アプリ起動等）は CLAUDE.md に反映する
- これにより後続の実装者・TDD タスク・人間レビューが手順を再現できる

## 信頼性レベル

各記録項目に 🔵（情報源に明示）/ 🟡（妥当な推測）/ 🔴（推測）を付す。

## tasks.db との連携

- 開始時: 対象タスクを `status = 'in_progress'`
- verify 完了（動作確認OK）時: `status = 'done'`、`update_badge = 1`、TASK ファイルに完了マーク
- 日時は JST（`datetime('now', '+9 hours')`）。`sqlite3` が無ければ overview.md のチェックボックスで管理

## ダッシュボードへのライブ通知（任意・best-effort）

beam ダッシュボード（task-bridge ビューア）が起動していれば、**status 更新直後**に hook を叩くと一覧がライブ更新される。未起動でも実装は続行（失敗は無視）。

```bash
curl -s -m 2 -X POST http://127.0.0.1:${BEAM_DASHBOARD_PORT:-3939}/api/hook \
  -H 'content-type: application/json' \
  -d '{"type":"status_changed","project":"{要件名}","taskId":"{TASK-ID}"}' >/dev/null 2>&1 || true
```
