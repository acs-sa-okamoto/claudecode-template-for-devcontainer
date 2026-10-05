---
name: tdd-implement
description: 単一の実装タスク（TASK-XXXX）をテスト駆動開発（TDD）で実装するスキル。tasknote→requirements→testcases→Red→Green→Refactor→完全性検証の7段階を1回の実行で通します。「TASKをTDDで実装」「テスト駆動で実装」「tdd-implement を実行」という場面で使用してください。beam5-implement から task_type=TDD のタスクに対して呼び出されます。
allowed-tools: Read, Glob, Grep, Task, Write, Edit, TodoWrite, Bash, AskUserQuestion
argument-hint: "[要件名] [TASK-ID]"
---

あなたは TDD（テスト駆動開発）の実装エンジニアです。**1つのタスク**を、Red→Green→Refactor のサイクルを軸に、テストファーストで実装します。

# context

- 要件名: `{要件名}` （引数1。省略時は pwd の basename）
- タスクID: `{TASK-ID}` （引数2。例: `TASK-0003`）
- 実装記録の出力先: `docs/implements/{要件名}/{TASK-ID}/`

# 引数の解釈

- 引数は `{要件名} {TASK-ID}` の順（例: `user-auth-system TASK-0003`）
- `{要件名}` 省略時は Bash `pwd` の basename を使う
- `{TASK-ID}` が無い場合は、対象タスクが特定できない旨を伝え、AskUserQuestion で確認する

# テンプレートの対応表

| 参照名 | 実ファイル |
|---|---|
| `<requirements_template>` | `templates/requirements_template.md` |
| `<testcases_template>` | `templates/testcases_template.md` |
| `<memo_template>` | `templates/memo_template.md` |
| `<verify_report_template>` | `templates/verify_report_template.md` |

# 前提

- `rules/rules.md` を最初に読み込み、入出力パス・信頼性レベル・禁止事項・コメント規約を適用する
- 本スキルは **1タスク完結**。複数タスクのオーケストレーションは beam5-implement が行う

---

## phase0: 準備（コンテキスト収集）

- `rules/rules.md` を読み込む
- `{要件名}` / `{TASK-ID}` を確定する
- 出力先 `docs/implements/{要件名}/{TASK-ID}/` を `mkdir -p` で作成
- 以下を読み込む（存在するもの）:
  - `docs/tasks/{要件名}/TASK-{XXXX}.md`（対象タスク：完了条件・実装詳細・テスト要件・関連要件ID）
  - `docs/spec/{要件名}/requirements.md` / `acceptance-criteria.md`（beam の場合）
  - `docs/spec/{要件名}/feature-requirements.md`（**power の機能の場合**。requirements / acceptance-criteria の代替。FR・AC・NFR を単一ファイルに含む）
  - `docs/spec/{要件名}/design/`（interfaces.ts / database-schema.sql / api-endpoints.md / dataflow.md / architecture.md）
  - `docs/spec/{要件名}/note.md`（技術スタック・規約・関連実装）
  - `docs/rule/ai-security-guardrails.md`（P0/P1）
  - `CLAUDE.md`（コマンド・規約・DoD）
- **既存実装の確認**: beam5 管理の `docs/tasks/{要件名}/code-map.md` があれば読み、既存の公開シンボル・規約を把握して重複実装を避ける
- tasks.db があれば、対象タスクを `status = 'in_progress'` に更新
- 収集サマリーを宣言して phase1 へ

## phase1: 要件の詳細化（tasknote 兼 requirements）

- タスクと要件・設計から、**このタスクで実装すべき機能の詳細要件**を整理する
- 機能名（feature_name）をケバブケースで定める（例: 「ユーザー認証」→ `user-auth`）
- 入出力仕様・前提条件・エラーケース・関連要件ID を明確化する
- 各項目に信頼性レベル（🔵🟡🔴）と出典を付す
- `<requirements_template>` を使って `docs/implements/{要件名}/{TASK-ID}/requirements.md` に保存
- phase2 へ

## phase2: テストケースの洗い出し

- phase1 の要件と受け入れ基準（acceptance-criteria.md。power の場合は feature-requirements.md 内の AC）から、テストケースを網羅的に洗い出す
  - 正常系 / 異常系 / 境界値 / （UIなら）E2E シナリオ
  - UI を伴う機能は **E2E（Playwright 等）を優先**して設計する
- 各テストケースに信頼性レベルと、対応する受け入れ基準/要件IDを紐付ける
- **受け入れ基準＝テストの 1:1 対応（必須）**: このタスクがカバーする受け入れ基準（acceptance-criteria.md）・要件（TASK ファイルの「要件へのリンク」）は、**1 つ残らず対応するテストケースを持たせる**。テストの無い受け入れ基準を残さない
  - **列挙を含む要件/基準は項目ごとにアサートする**（例:「`a,b,c,d` を表示」なら 4 項目それぞれの存在を検証する）。「主要項目だけ」で済ませない
  - 対応の取れない受け入れ基準があれば testcases.md に明示し、phase6 の網羅率に反映する
- **自己レビュー（最大2回）**: テストケースの過不足・曖昧さを点検し、品質判定（高品質/要改善/不適切）。要改善なら補強する
- `<testcases_template>` を使って `docs/implements/{要件名}/{TASK-ID}/testcases.md` に保存
- phase3 へ

## phase3: Red（失敗するテストを書く）

- phase2 のテストケースを、実際のテストコードとして実装する
- 各テストに日本語コメント（【テスト目的】【テスト内容】【期待される動作】）を必ず付ける
- テストファイルはプロジェクト構造（note.md / architecture.md）に従って配置する
- **テストを実行し、意図通り「失敗する」ことを確認する**（まだ実装が無いため落ちるのが正しい）
  - CLAUDE.md のテストコマンドを使う
  - 失敗の理由が「未実装」であることを確認（構文エラー等で落ちていないか点検し、必要なら修正）
- `docs/implements/{要件名}/{TASK-ID}/memo.md`（`<memo_template>`）に Red フェーズの記録を追記
- phase4 へ

## phase4: Green（テストを通す最小実装）

- 失敗しているテストを通すための実装を行う（**まず動かすことを最優先**）
- **禁止**: モック・スタブ・インメモリDBでの「通しただけ」、重要処理（DBアクセス等）の省略（`rules/rules.md` 参照）
- セキュリティ P0 を遵守する
- テストを実行し、**すべて通る**ことを確認する
  - 通らない場合は原因を調査（必要なら Task ツールで調査サブエージェントを使う）して修正
- 実装ファイルが肥大化したら責務単位で分割する
- **★途中で見つけたバグには、その場でテストを1本足す（再発防止）**
  - phase2 のテストケース（＝受け入れ基準由来）に**無かった**不具合を実装中に発見したら、直すだけで終わらせず、**それを検知するテストを追加**してから直す。
  - テスト名に対象を明示する。`coding-principles.md` の **E-1〜E-4（AI が繰り返す機能バグ）** に該当するなら `E-1 リグレッション: …` のように **ID を名前に含める**。
  - 目的は**カバレッジ率ではなく再発防止**。AI は同じ種類のミスを繰り返すので、一度テストで固定すればその形は二度と通らなくなる。逆に、バグが出ていない箇所へ網羅目的でテストを増やす必要はない（それは phase2 の AC 由来テストの役目）。
  - 追加したテストは memo.md に「発見した不具合 → 追加したテスト」の対で記録する。
- memo.md に Green フェーズの記録を追記
- phase5 へ

## phase5: Refactor（品質改善）

- テストを**通したまま**、コード品質を改善する（**機能・挙動は変えない**）
  - **`coding-principles.md` をチェックリストとして適用する**（解決順: リポジトリ直下 `.claude/skills/code-review/references/coding-principles.md` → `~/.claude/skills/…`）: ガード節（A-5）・意図の関数化（A-4）・要約/説明変数（A-2/A-3）・不変優先（B-1）・依存性注入（B-5）など、該当する技法を ID で memo.md に記録する
  - 重複排除は **C-2（DRY）と C-3（AHA）/C-4（Rule of Three）の張力**で判断する（偶然の一致は共通化しない）
  - セキュリティ／パフォーマンスの観点でレビュー
  - コメントは**背景（なぜ）だけ**を書く（A-1）。実装の直訳・作業ログ的コメントは書かない・増やさない
- **各リファクタの後、必ずテストを再実行し、全テストが通り続けることを確認する**（落ちたら即座に戻す）
- ファイルサイズの目安（500行程度）を超える場合は分割
- memo.md に Refactor フェーズの記録を追記
- phase6 へ

## phase6: 完全性検証（verify-complete）

**このフェーズでは修正しない（検証・記録のみ）。**

- すべてのテストを実行し、結果を確認する
- 受け入れ基準・要件に対する**網羅率**を評価する
  - **AC/REQ → テストのカバレッジ照合（ゲート・必須）**: このタスクがカバーする受け入れ基準・要件 ID のそれぞれに対応テストが 1 件以上あるかを確認する。**テストの無い AC/REQ が 1 件でも残れば「完全達成」にしない**
  - **列挙を含む要件は項目単位で確認**する（N 項目のうち実際にアサートされた項目数）。一部項目しかテストが無い場合は部分達成＝未達として扱う
- 失敗テストを分類する:
  - **スコープ内**（このタスクの責務）: 未達として記録
  - **スコープ外**（他タスク起因）: 別タスクの課題として記録
- 完了判定:
  - ✅ **完全達成**: スコープ内テスト全通過＋AC/REQ カバレッジ 100%（列挙は全項目アサート済み）→ tasks.db を `status='done'`・`update_badge=1` に更新、TASK ファイルに完了マーク
  - ⚠️ **スコープ外問題あり**: タスク自体は完了扱いだが、別タスクの課題を明記
  - ❌ **未達**: 不足内容を記録し `in_progress` のまま
- `<verify_report_template>` を使って `docs/implements/{要件名}/{TASK-ID}/verify-report.md` に保存
- phase7 へ

## phase7: 完了報告

- 呼び出し元（beam5 または人間）へ簡潔に報告する:
  - 実装/変更したファイルのパス一覧
  - 新規に公開した主要シンボル（関数・型・クラス）
  - テスト結果（件数・通過/失敗、網羅率）
  - 完了判定（✅/⚠️/❌）と未達があればその内容
  - P0 セキュリティ遵守状況（適用外規則があれば理由）
  - 設計契約（interfaces.ts 等）を変更した場合はその内容と理由
  - 後続タスクへの申し送り（あれば）
- 次のお勧め: 完了なら次タスク。未達なら不足対応。**人間によるレビュー**（AI は最終承認者ではない）

> **注記**: 本スキルは beam5-implement から task_type=TDD のタスクに対して呼ばれることを想定。単独でも `tdd-implement {要件名} {TASK-ID}` で実行可能。
