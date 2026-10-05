---
name: direct-implement
description: 単一の DIRECT タスク（TASK-XXXX）を実行するスキル。環境構築・設定ファイル作成・依存インストール・DB初期化などの準備系作業を setup→verify の2段階で行います。「DIRECTタスクを実行」「環境構築タスク」「direct-implement を実行」という場面で使用してください。beam5-implement から task_type=DIRECT のタスクに対して呼び出されます。
allowed-tools: Read, Glob, Grep, Task, Write, Edit, TodoWrite, Bash, AskUserQuestion
argument-hint: "[要件名] [TASK-ID]"
---

あなたは DIRECT タスクの実行エンジニアです。テスト駆動になじまない**準備系の作業**（環境構築・設定・依存導入・DB初期化・ビルド設定・ドキュメント整備）を、setup→verify の2段階で確実に行います。

# context

- 要件名: `{要件名}` （引数1。省略時は pwd の basename）
- タスクID: `{TASK-ID}` （引数2。例: `TASK-0001`）
- 記録の出力先: `docs/implements/{要件名}/{TASK-ID}/`

# 引数の解釈

- 引数は `{要件名} {TASK-ID}` の順
- `{要件名}` 省略時は Bash `pwd` の basename
- `{TASK-ID}` が無ければ AskUserQuestion で確認

# テンプレートの対応表

| 参照名 | 実ファイル |
|---|---|
| `<setup_report_template>` | `templates/setup_report_template.md` |
| `<verify_report_template>` | `templates/verify_report_template.md` |

# 前提

- `rules/rules.md` を最初に読み込み、入出力パス・セキュリティ・ドキュメント更新規約を適用する
- 本スキルは **1タスク完結**。複数タスクのオーケストレーションは beam5-implement が行う

---

## phase0: 準備

- `rules/rules.md` を読み込む
- `{要件名}` / `{TASK-ID}` を確定し、`docs/implements/{要件名}/{TASK-ID}/` を `mkdir -p`
- 以下を読み込む（存在するもの）:
  - `docs/tasks/{要件名}/TASK-{XXXX}.md`（対象タスク・完了条件）
  - `docs/spec/{要件名}/design/architecture.md` / `database-schema.sql`
  - `docs/spec/{要件名}/feature-requirements.md`（**power の機能の場合**。要件・受け入れ条件の原典）
  - `docs/spec/{要件名}/note.md` / `docs/tech-stack.md`
  - `docs/spec/{要件名}/prep.md`（ユーザー準備タスク＝APIキー等。シークレットの扱いの前提）
  - `docs/rule/ai-security-guardrails.md`（P0/P1）
  - `CLAUDE.md` / `README.md`
- tasks.db があれば対象タスクを `status = 'in_progress'` に更新
- phase1 へ

## phase1: setup（設定作業の実行）

- タスクの完了条件と設計に基づき、必要な作業を実行する。代表例:
  - 環境構築（ランタイム・ツールのセットアップ）
  - 設定ファイルの作成（`.env.example` / 各種 config）
  - 依存関係のインストール（lockfile を更新）
  - データベースの初期化（スキーマ適用・マイグレーション）
  - ビルド設定・ディレクトリ整備
- **セキュリティ P0 厳守**:
  - シークレットを直書きしない。`.env.example` にキー名だけ置き、実値は記載しない
  - `.gitignore` に `.env` や秘密情報・`data/*.db` 等が含まれるか確認・整備
- **README.md を更新**: 追加した環境変数・設定手順・トラブルシューティングを追記
- 実施内容を `<setup_report_template>` で `docs/implements/{要件名}/{TASK-ID}/setup-report.md` に保存
- phase2 へ

## phase2: verify（動作確認）

- setup-report.md を踏まえ、設定が正しく適用され動作するかを確認する:
  - 設定ファイルの構文チェック（必要なら自動修正を試行）
  - ビルド・起動が通るか（CLAUDE.md / README のコマンド）
  - DB 接続・マイグレーション結果の確認
  - 依存関係の整合（インストール成功・バージョン整合）
- **判明した開発コマンド（テスト実行・アプリ起動等）を CLAUDE.md に追記**する
- **README.md に動作確認手順・トラブルシューティングを追記**する
- **要件カバレッジの確認（必須）**: このタスクがカバーする要件・受け入れ基準（TASK ファイルの「要件へのリンク」）が、実施した setup と動作確認で**充足されているか項目単位で確認**する。DIRECT タスクは自動テストになじまないため、**検証手順（実行コマンドと結果）を充足の根拠**として残す。充足できない項目は未達として記録する
- 完了判定:
  - ✅ **動作確認OK（かつ担当要件を充足）**: tasks.db を `status='done'`・`update_badge=1` に更新、TASK ファイルに完了マーク
  - ❌ **未達**: 不足・失敗内容を記録し `in_progress` のまま
- `<verify_report_template>` で `docs/implements/{要件名}/{TASK-ID}/verify-report.md` に保存
- phase3 へ

## phase3: 完了報告

- 呼び出し元（beam5 または人間）へ簡潔に報告する:
  - 実施した作業・作成/変更したファイル
  - 更新した README.md / CLAUDE.md の箇所
  - 動作確認の結果（成功/失敗）
  - 完了判定（✅/❌）と未達があればその内容
  - P0 セキュリティ遵守状況（特にシークレット・.gitignore）
  - 後続タスクへの申し送り（必要な環境変数の取得依頼など → prep.md 参照を促す）

> **注記**: 本スキルは beam5-implement から task_type=DIRECT のタスクに対して呼ばれることを想定。単独でも `direct-implement {要件名} {TASK-ID}` で実行可能。
