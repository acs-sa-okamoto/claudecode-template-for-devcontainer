---
name: power5-implement
description: 機能追加の実装を行うスキル（power ワークフローの工程5）。tasks.db（テーブル名={機能名}）と TASK-*.md を読み、フェーズ単位でサブエージェントに委譲して tdd-implement/direct-implement（args="{機能名} {TASK-ID}"）で各タスクを実装します。「実装して」「power5」「機能を実装」という場面で使用してください。beam5-implement ディスパッチャは呼びません（要件名=pwd 衝突回避）が、実装エンジン（tdd/direct-implement）はそのまま再利用します。既存規約（understanding-brief）に準拠し、既存を壊さない（REG 意識）。code-map を更新します。各実装フェーズの成果は /code-review で CRITICAL/HIGH=0 までゲートしてから、beam-sync 経由でフェーズ単位のスタックド PR にします（own モード）。包括的な検証・回帰・要件適合は power6-verify に委ねます。
allowed-tools: Read, Glob, Grep, Task, Write, Edit, Bash, AskUserQuestion, Skill, TodoWrite
argument-hint: "[機能名（任意）/ TASK-ID / Phase N / 空]"
---

あなたは実装フェーズのディスパッチャです。**自分で大量にコードを書かず**、power4 が分解したタスクを **フェーズ単位でサブエージェントに委譲**し、各タスクを `tdd-implement`/`direct-implement` で実装させ、結果サマリーだけを集約します（メインの肥大化を防ぐ）。

これは **power ワークフローの工程5（実装）**。`要件名=pwd` の衝突を避けるため **beam5-implement ディスパッチャは呼ばず**、**実装エンジン（`tdd-implement`/`direct-implement`）を `要件名={機能名}` で直接再利用**します。

# 設計思想
- **会話の記憶でなく、ファイル（コード＋設計＋code-map）を state とする。**
- フェーズ単位でサブエージェントを起動し、境界でコンテキストをリセット。
- **既存システムへの追加**なので、understanding-brief の**規約に準拠**し、**REG（壊してはいけない既存機能）を意識**する。
- P0 セキュリティは各サブエージェントが `ai-security-guardrails.md` を毎回読んで遵守。
- **包括的な検証・回帰・要件適合は power6-verify が担う**。本スキルは実装とフェーズ単位の sanity check（build/test/lint）まで。

# context
- 機能名: `{機能名}`（引数 or 自動検出）
- 入力: `docs/tasks/{機能名}/`（overview・TASK-*）/ `data/tasks.db`（テーブル=`{機能名}`）/ `docs/spec/{機能名}/`（feature-requirements・understanding-brief・design）/ `docs/code-map.md`
- 実装ターゲット: 引数（空=全フェーズ / `TASK-XXXX` / `Phase N`）

---

## step1: 準備と補助コンテキストの staging（★再利用のための橋渡し）
- `{機能名}` を確定（引数。無ければ Glob、複数なら AskUserQuestion）。
- **Git ブランチの確保**（git 管理下の場合）: 作業は `feature/{機能名}` ブランチ上で行う。未作成ならデフォルトブランチを基点に作成、既存ならチェックアウト。非 git／git 不在ならスキップ。
- ルール読込: `CLAUDE.md` / `docs/rule/ai-security-guardrails.md`。
- 入力読込: `docs/spec/{機能名}/feature-requirements.md`・`understanding-brief.md`・`design/`・`docs/code-map.md`・`docs/tasks/{機能名}/overview.md`。
- **整合ドリフトの確認（git 管理下・warn）**: 仕様・設計（`docs/spec/{機能名}/`）の最終コミットが下流（`docs/tasks/{機能名}/`・`src/`）より新しい場合、上流だけ改定された疑いを警告し、**先に `/revise` を提案**する（未コミット変更は「最新」扱い・両方に触れた同一コミットは除外。実行は継続可）。
- **staging（重要）**: `tdd-implement`/`direct-implement` は `docs/spec/{要件名}/note.md` と `docs/tasks/{要件名}/code-map.md` を読むため、power の成果物を**そのパスに用意**する:
  - `docs/spec/{機能名}/note.md` … 無ければ `understanding-brief.md` を基に生成（技術スタック・踏襲規約・統合点・既存制約を要約）。
  - `docs/tasks/{機能名}/code-map.md` … 無ければ `docs/code-map.md` から複製。
  - （これにより実装エンジンが既存規約・実装現状を把握でき、重複実装・規約違反を避けられる）
- タスク取得: `sqlite3` があれば `"{機能名}"` テーブルから `status != 'done'` かつ `is_deleted = 0` のタスクを `phase/task_id/status/blocked_by/task_type` 付きで取得。無ければ `overview.md`＋`TASK-*.md` から把握。
- 引数で `TASK-XXXX`/`Phase N` が指定されていればその範囲に絞る。

## step2: 実行計画
- フェーズ順（1→2→…）、フェーズ内は `blocked_by` 依存順に並べる。未 done の前提があれば AskUserQuestion で確認。
- 実装予定のフェーズ・タスク（task_type 付き）と、既 done はスキップする旨を表示し、AskUserQuestion で実行可否を確認。

## step3: フェーズ実装ループ（フェーズ境界でコンテキストリセット）
各フェーズを **サブエージェント（Task）に委譲**する（1フェーズ=1 fresh context）。サブエージェントへのプロンプトに過不足なく含める:

```
あなたは実装担当エンジニアです。以下のフェーズの全タスクを実装してください。
## 厳守事項
- セキュリティ: docs/rule/ai-security-guardrails.md を読み P0 を必ず遵守（適用外は理由を述べる）。
- 既存規約の準拠: docs/spec/{機能名}/note.md（＝understanding-brief 由来）と docs/tasks/{機能名}/code-map.md に従い、既存の命名・構造・エラー処理・パターンに合わせる。
- 既存を壊さない: understanding-brief の REG（回帰リスク）に該当する既存機能の挙動を変えない。
- 設計準拠: docs/spec/{機能名}/design/（change-plan ほか）に従う。契約変更が要るなら該当ファイルを更新し理由を記録。
## 対象タスク（依存順）: {TASK-XXXX のリストと task_type}
## 実装手順（タスクごとに Skill で実装エンジンを呼ぶ）
- task_type=TDD:    Skill(skill="tdd-implement",    args="{機能名} {TASK-ID}")
- task_type=DIRECT: Skill(skill="direct-implement", args="{機能名} {TASK-ID}")
  各スキルが Red→Green→Refactor / setup→verify と記録・tasks.db status 更新まで行う。1タスク完了後に次へ。
## フェーズ完了時
- フェーズ全体で build / 全test / typecheck / lint を実行し通す（CLAUDE.md のコマンド）。
- 担当タスクがカバーする FR/NFR/AC が 1:1 でテスト化されているか確認し、未対応があれば報告。
## 返却（簡潔に。コード全文は貼らない）
- 変更/追加ファイル一覧、新規公開シンボル、確立した規約・申し送り、設計契約変更（あれば）、test/typecheck/lint 結果、AC/REQ カバレッジ、P0 遵守状況、各タスク完了状況。
```

- サマリー受領後: `docs/code-map.md`（＋staging した `docs/tasks/{機能名}/code-map.md`）を現状インデックスとして更新。**構造が変わって全体像の図（構成／主要フロー／データの流れ）が実態とずれたなら図と根拠も直す。ただし冒頭の「検証リビジョン」は書き換えない**——根拠の再検証は power6 が HEAD に対してまとめて行うため、ここで更新すると「検証していないのに検証済みに見える」状態を作ってしまう。tasks.db の完了タスクを `status='done'`・`update_badge=1` に更新（tdd/direct が各タスクで更新済みのはずだが、サブエージェント中断に備えた**保険の掃き寄せ**）。未完了は理由を記録。
### コードレビュー・ゲート（`/code-review`）★終了条件 = CRITICAL/HIGH ゼロ

このフェーズで実装したコードを、**PR 化する前に**レビューする（beam5・power6 と同じ方式）。**最大2ラウンド**:

1. `Skill(skill="code-review")`（引数なし＝ローカル変更）を実行する。**この時点でフェーズの変更は未コミット**なので、レビュー対象はこのフェーズの差分になる。生成レポートを読み、**反証されていない CRITICAL/HIGH** を抽出する。前フェーズは自分のフェーズブランチにコミット済み・各フェーズで対応済みのため、**このフェーズが変更したファイル**（サブエージェントの返却ファイル一覧）の指摘に注目する。
2. CRITICAL/HIGH があれば**修正**する（直接 Edit、または集中サブエージェント Task に委譲）。修正後 build / 全test / typecheck / lint を再実行して green を確認する。
   - **修正には再発防止テストを添える**: 直した不具合を検知するテストを1本書く。テスト名に対象を明示する（coding-principles の E-1〜E-4 に該当するなら `E-1 リグレッション: …` のように ID を含める）。カバレッジ率のためではなく、**同じ盲点の再発を機械的に止めるため**。既存改修では、このテストがそのまま次回以降の回帰ネット（REG）に加わる。
3. **修正差分に絞って再レビュー**（フルスキャンしない＝ノイズ・非決定性を抑える）。

- 終了条件は **CRITICAL/HIGH = 0**（指摘ゼロではない）。残る LOW/MEDIUM は「既知・許容」としてこのフェーズのサマリーに記録する。
- **★順序を入れ替えないこと（機械的検査が先）**: このゲートに入る時点で、サブエージェントが build / 全test / typecheck / lint を green にしている。**AI が書いたコードを同じ AI がレビューすると両方に同じ盲点が入る**ため、レビューは機械的検査の**代わりにはならない**。
- **なぜフェーズ境界で止めるのか**: Phase 1 で定着した悪いパターンは、レビューされなければ Phase 2 以降にそのまま伝播する。最後にまとめてレビューすると、手戻りが全フェーズに及ぶ。

### Git 連携（実装フェーズごとに別 PR）

- **own モード**: `Skill(skill="beam-sync", args="{機能名} power5-phase{現在のフェーズ番号}")` を実行し、当該フェーズの**レビュー済み**成果（`src/`・`tests/`・`docs/implements/{機能名}/`・更新した `code-map`）を**フェーズブランチ `power5-phase{N}-{機能名}`**（前フェーズの上に分岐。Phase 1 は `feature/{機能名}` の上）へコミットし、**スタックド PR を作成**する。`.env`・`data/tasks.db` は含めない。
  - `beam-sync` は名前こそ beam- だが **beam / power 共通の Git 連携スキル**である（スタック機構を二重に持つとドリフトするため1本に集約している）。
  - 前提未達（`gh` 未認証・`gh-stack` 未導入等）を報告されたら、その案内を伝えてフェーズは続行する。
  - **実装フェーズの PR は、全フェーズ完了・power6 の検証まではマージしない**（スタックに保持し、最後に `gh stack merge` でアトミックに落とす）。
- **upstream（OSS 本家）モード**: スタックを作らない。フェーズごとに `git commit -m "power5: implement Phase {N}"` するだけにとどめ、PR 化は power6 の 6-3（機能コードだけのクリーン PR）に委ねる。
- git 管理外ならスキップ。

- フェーズに未完了・失敗があれば AskUserQuestion で「再試行 / 次フェーズ / 中止」。
- 次フェーズへ（サブエージェント破棄＝リセット）。

## step4: 完了報告
- 実装したフェーズ・タスク（done 件数 / 全件数）、変更ファイル概要（code-map ベース）、各フェーズの build/test/lint 結果。
- **各フェーズのレビュー結果（CRITICAL/HIGH=0・残 LOW/MEDIUM {n} 件）と、作成したフェーズ PR の URL 一覧**。own モードなら `gh stack view --short` の出力も添える。
- 未完了タスク・残課題（あれば）。設計契約を変更した場合はその一覧。
- **次工程を強く案内: `power6-verify`**（build/test/lint の最終確認＋**実環境動作**＋**回帰（既存を壊していない）検証**＋要件適合＋`/code-review`＋code-map 最終更新）。本スキルは実装までで、**包括的検証は power6 が担う**。
- `power` 経由なら自動で power6 へ。

> **AI 生成コードは人間がレビューし、最終責任を持つ。AI は最終承認者ではない。**

---

## 環境前提
- 既存リポジトリ内で実行。WSL bash 推奨。
- 実装エンジン（tdd/direct-implement）・`estimate-storypoint` 等は引数で `要件名={機能名}` を受けるため衝突なく再利用できる。
