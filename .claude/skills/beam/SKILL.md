---
name: beam
description: PRDからタスク分解までを自動化するアプリ作成ワークフロー（beam シリーズ）のオーケストレーター。「beam を実行」「アプリ作成ワークフローを開始」「設計を進めたい」「PRDの次のステップに進みたい」「要件定義からタスク分解まで一気に作りたい」という場面で積極的に使用してください。作業規模と停止点をユーザーに確認し、Skill ツールで beam1（コンテキスト収集）→ beam2（要件定義）→ beam3（設計）→ beam4（タスク分解）を、選択した停止点までメインコンテキストで順に実行します。各フェーズは AskUserQuestion による対話的ヒアリングを行うため、サブエージェントではなくメインで実行します（重い非対話処理は各フェーズが内部でサブエージェントに委譲）。実装（beam5-implement）は重いフェーズのため、成果物をレビューした後に個別実行します。
allowed-tools: AskUserQuestion, Skill, Task, Read, Glob, Bash, TodoWrite
---

あなたは beam シリーズ（アプリ作成自動化ワークフロー）のオーケストレーターです。各フェーズを **Skill ツールでメインコンテキストで順次実行**します。

> **重要（対話の制約）**: beam1〜4 は AskUserQuestion による対話的ヒアリングが核心です。サブエージェント（Task）内では AskUserQuestion がユーザーに届かないため、**各フェーズはサブエージェントで包まず、メインで `Skill` 実行**します。コンテキストの重い処理（コードベース探索・並列ファイル生成など）は、各フェーズスキルが内部でサブエージェントに委譲します。

# context

- 要件名: `{要件名}` （step1 で確定）
- 作業規模: `{work_scope}` （step2 でユーザーに確認）
- 成果物の出力先:
  - `docs/spec/{要件名}/` … 要件・設計（beam1〜3）
  - `docs/tasks/{要件名}/` … タスク・code-map（beam4〜5）
  - `data/tasks.db` … タスク管理DB（beam4 が作成）
  - `src/` ほか … 実装コード（beam5）

# beam フェーズ一覧（拡張可能な配列）

実行順に並べる。新しいフェーズを追加する場合は、このリストの末尾に1行追加する。

| 順序 | スキル名 | 役割 | 主な出力 | オーケストレーター |
|---|---|---|---|---|
| 1 | `beam1-tasknote` | コンテキスト収集 | `docs/spec/{要件名}/note.md` | 実行対象 |
| 2 | `beam2-requirements` | 要件定義（EARS） | `requirements.md` / `user-stories.md` / `acceptance-criteria.md` / `interview-record.md` / `prep.md` | 実行対象 |
| 3 | `beam3-design` | 技術設計 | `docs/spec/{要件名}/design/`（`architecture.md` / `dataflow.md` / `interfaces.ts` / `database-schema.sql` / `api-endpoints.md`） | 実行対象 |
| 4 | `beam4-tasks` | タスク分解・SP見積もり | `docs/tasks/{要件名}/overview.md` / `TASK-*.md` / `data/tasks.db` | 実行対象（停止点の上限） |
| 5 | `beam5-implement` | 実装（フェーズ単位） | `src/` のコード / `docs/tasks/{要件名}/code-map.md` | **対象外（個別実行）** |

> **実行範囲**: 本オーケストレーターは **beam1〜beam4** を、ユーザーが選んだ**停止点**まで実行する。**beam5-implement（実装）は対象外**。実装は成果物（要件・設計・タスク）をレビューしてから `/beam5-implement` で個別に実行する。
>
> **補助スキル**: `estimate-storypoint`（ストーリーポイント見積もり）は beam4 が内部で呼び出す。`scope-options`（スコープ4案提案）は step2 の選択に応じて beam2（define）と beam4（estimate）が内部で呼び出す。いずれもオーケストレーターが直接実行するフェーズではない。

**スキル存在チェック（堅牢性）**: beam1〜beam4 はすべてインストール済みである前提。各フェーズ実行前に対応スキルの存在を確認し（**解決順: リポジトリ直下 `.claude/skills/` → `~/.claude/skills/`**。テンプレート由来リポジトリは repo 同梱）、**万一見つからない場合のみ**そのフェーズをスキップしてユーザーに警告する。

---

## step1: 前提確認と要件名の取得

- **要件名の確定**
  - Bash で `pwd` を実行し、basename をプロジェクトルートディレクトリ名として取得する
  - これを `{要件名}` とする
  - 取得した `{要件名}` をユーザーに表示する

- **PRDの存在確認**
  - `docs/spec/{要件名}/product-requirements.md` の存在を確認する
  - **存在しない場合**: AskUserQuestion で以下を確認し、適切に分岐:
    ```
    AskUserQuestion({
      questions: [{
        question: "PRD（product-requirements.md）が見つかりません。どうしますか？",
        header: "PRD未検出",
        multiSelect: false,
        options: [
          { label: "to-prd スキルで先にPRDを作成", description: "/to-prd を実行して PRD を作成する。完了後に beam を再実行してください" },
          { label: "PRDなしで続行", description: "PRDなしで beam1 から進める（要件定義の信頼性は低くなる）" },
          { label: "中止", description: "beam を中止する" }
        ]
      }]
    })
    ```
  - "to-prd で先に作成" を選んだ場合は、その旨を伝えてスキルを終了
  - "中止" を選んだ場合は終了
  - "PRDなしで続行" の場合は step2 へ

- **既存進捗の確認**
  - `docs/spec/{要件名}/` 配下に既存ファイルがあるかを確認する
  - 既存ファイルがある場合は一覧をユーザーに表示する（情報提供のみ。各スキル内で再生成判断する）

- step2 を実行する

## step2: 作業規模の確認

AskUserQuestion ツールを使って作業規模を質問する：

```
AskUserQuestion({
  questions: [{
    question: "この要件の作業規模について教えてください",
    header: "作業規模",
    multiSelect: false,
    options: [
      {
        label: "フル機能開発（推奨）",
        description: "詳細なEARS要件定義、包括的なユーザーストーリー、完全な受け入れ基準、非機能要件・エッジケース含む"
      },
      {
        label: "軽量開発",
        description: "必要最小限の要件定義、基本的なユーザーストーリーのみ、主要な受け入れ基準のみ、非機能要件は最低限"
      },
      {
        label: "カスタム",
        description: "含めたい項目を個別に選択"
      }
    ]
  }]
})
```

ユーザーの選択を `{work_scope}` に保存する。

- `"フル機能開発（推奨）"` → `{work_scope}` = `"フル機能開発"`
- `"軽量開発"` → `{work_scope}` = `"軽量開発"`
- `"カスタム"` → `{work_scope}` = `"カスタム"`

続けて、**スコープ4案提案の要否**を確認する：

```
AskUserQuestion({
  questions: [{
    question: "スコープ4案提案（ミニマム/要望/リッチ/フルの比較と SP 見積もり）を含めますか？",
    header: "4案提案",
    multiSelect: false,
    options: [
      { label: "含める（推奨）", description: "beam2 で機能×4案マトリクスを作成し、beam4 の正式見積もり後に4案の SP 比較と案の選択を行う（ヒアリングが5〜7問増える）" },
      { label: "要望案のみ", description: "従来どおり要望どおりの案だけを進める" }
    ]
  }]
})
```

選択を `{scope_options}` に保存する（「含める」→ `on` ／「要望案のみ」→ `off`）。

step3 を実行する。

## step3: 停止点の選択と実行計画の確認

### 3-1. 停止点の選択

どのフェーズまで実行するかを AskUserQuestion で確認する。**実装（beam5）はこのオーケストレーターでは実行しない**（後で個別実行）。

```
AskUserQuestion({
  questions: [{
    question: "どこまで実行しますか？（実装 beam5 は別途 /beam5-implement で行います）",
    header: "停止点",
    multiSelect: false,
    options: [
      { label: "タスク分解まで（推奨）", description: "beam1〜beam4 を実行。要件→設計→タスク分解まで一気に進める" },
      { label: "設計まで", description: "beam1〜beam3 を実行。設計文書まで作成して止める" },
      { label: "要件定義まで", description: "beam1〜beam2 を実行。要件定義まで作成して止める" }
    ]
  }]
})
```

選択を `{停止点}` として保持し、実行対象フェーズを確定する：

- 「タスク分解まで」→ beam1, beam2, beam3, beam4
- 「設計まで」→ beam1, beam2, beam3
- 「要件定義まで」→ beam1, beam2

### 3-2. スキル存在チェック

`{停止点}` までの対象フェーズについて、対応スキルが存在するか確認する（堅牢性のため。**解決順: リポジトリ直下 `.claude/skills/` → `~/.claude/skills/`**）:
- `beam1-tasknote/SKILL.md`
- `beam2-requirements/SKILL.md`
- （設計まで以上なら）`beam3-design/SKILL.md`
- （タスク分解までなら）`beam4-tasks/SKILL.md`

### 3-3. 実行計画の表示と確認

実行予定を表示する（例: 作業規模=フル機能開発、停止点=タスク分解まで）:
```
以下のフェーズを順に実行します（作業規模: フル機能開発 / 停止点: タスク分解まで）:
  ✅ beam1-tasknote      (コンテキスト収集)
  ✅ beam2-requirements  (要件定義)
  ✅ beam3-design        (技術設計)
  ✅ beam4-tasks         (タスク分解・SP見積もり)
  ⏹  beam5-implement     (この実行では行いません。後で /beam5-implement)
```
- 万一スキルが見つからないフェーズがあれば `⏭️ スキップ` と表示する

AskUserQuestion で実行可否を確認:
```
AskUserQuestion({
  questions: [{
    question: "上記の計画で実行してよいですか？",
    header: "実行確認",
    multiSelect: false,
    options: [
      { label: "はい、実行する", description: "計画通り実行する" },
      { label: "中止", description: "beam を中止する" }
    ]
  }]
})
```

- "中止" の場合は終了
- "はい" の場合は step4 を実行

## step4: 各フェーズの実行（メインで Skill 直接呼び出し）

`{停止点}` で決まった対象フェーズを、**メインコンテキストで `Skill` ツールにより順番に**実行する。

> **なぜサブエージェントを使わないか**: beam1〜4 は AskUserQuestion による対話的ヒアリングが核心。サブエージェント（Task）内では AskUserQuestion がユーザーに届かないため、ヒアリングが丸ごとスキップされてしまう。したがって各フェーズは**メインで Skill 実行**する。各フェーズスキルは、内部で重い非対話処理（コードベース探索・並列ファイル生成）を必要に応じてサブエージェントに委譲するため、メインの肥大化はその範囲で抑えられる。

### 各フェーズの実行パターン

各 beam スキルを、Skill ツールで直接呼び出す（引数として `{work_scope}` を渡す）:

```
Skill({ skill: "{スキル名}", args: "{work_scope}" })
```

- 呼び出されたスキルは**メインコンテキストで**実行され、step3 等で **AskUserQuestion による対話的ヒアリングが正常に機能する**
- 完了後、そのフェーズの成果（作成ファイル・サマリー・信頼性レベル分布）を確認し、ユーザーに簡潔に提示してから次フェーズへ進む

### 実行順序

`{停止点}` で決まった対象フェーズのみを順に実行する（インストール済みのもの）:

1. **beam1-tasknote** → `Skill({ skill: "beam1-tasknote", args: "{work_scope}" })`
2. **beam2-requirements** → `Skill({ skill: "beam2-requirements", args: "{work_scope} scope-options={scope_options}" })`
3. **beam3-design**（停止点が「設計まで」以上の場合） → `Skill({ skill: "beam3-design", args: "{work_scope}" })`
4. **beam4-tasks**（停止点が「タスク分解まで」の場合） → `Skill({ skill: "beam4-tasks", args: "{work_scope} scope-options={scope_options}" })`
5. **スコープ再整列ループ**（`{scope_options}`=on かつ停止点が「タスク分解まで」の場合のみ）: beam4 完了後（beam4 の step7 で scope-options が4案比較と選択を実施済み）、`docs/spec/{要件名}/scope-options.md` の**選定記録**を確認する。**要望案以外が選ばれ、再整列チェックに未完了が残っている場合**、beam2 → beam3 → beam4 を**同じ args でもう一巡**実行する（各フェーズが選定記録を読んで**選択案モード**で動作し、完了時に再整列チェックを ✅ にする。beam4 の step7 は選定記録が記録済みのためスキップされる）。一巡後、再整列チェックがすべて ✅ であることを確認して step5 へ。

**beam5-implement はこの step では実行しない**（オーケストレーター対象外。実装は後で `/beam5-implement` で行う）。

各フェーズの完了後、成果サマリーをユーザーに簡潔に表示してから次フェーズへ進む。

### エラー発生時

フェーズスキルがエラー・中断で終わった場合：
- エラー内容をユーザーに表示
- AskUserQuestion で「再試行 / 次のフェーズに進む / 中止」を確認

### TODO 更新

- 各フェーズ実行前に TodoWrite で TODO を更新する（「{スキル名} 実行中」など）
- 各フェーズ完了後に「completed」にマーク

- すべてのフェーズが完了したら step5 を実行

## step5: 完了報告

- 実行したフェーズ一覧（停止点まで）と各成果物を集約表示
- 成果物の一覧を Glob で取得して表示:
  - `docs/spec/{要件名}/`（note・要件・設計）
  - `docs/tasks/{要件名}/`（overview・TASK-*。タスク分解まで実行した場合）
- 全フェーズの主要サマリーをまとめて表示（信頼性レベル分布・SP合計など）
- **scope-options を実行した場合**: 4案の SP 比較表の要約と**選定結果**（選択案・再整列の有無）を表示し、`scope-options.md` へのパスを案内する
- `prep.md` が生成されている場合、ユーザー準備タスクの件数と必須/推奨の内訳を案内
- 次のお勧めアクションを表示:
  - 生成物（要件・設計・タスク）を**レビュー**する
  - **タスク分解まで完了した場合**: 内容を確認したら、**`/clear`（または新しいセッション）でコンテキストをリセットしてから** `/beam5-implement` で実装を開始することを推奨（実装は重いフェーズ。beam5 は note.md / requirements.md / design/* / tasks.db / TASK-*.md からすべて読み直すため、会話履歴は不要。真っさらな状態で始めるのが最もクリーン）
    - ※ `/clear` の前に、ここまでの生成物が**ファイルに保存済み**であることを確認する（会話は消えてもファイルは残る）
  - **設計／要件で止めた場合**: 続きは `/beam`（停止点を先に進めて再実行）、または対象スキルを個別に実行
  - 実装後は `/security-review` と人間によるコードレビュー（**AI は最終承認者ではない**）
