# スキルカタログ

`~/.claude/skills/` 配下の全スキルの索引。**新規開発は beam、既存改修は power、仕様変更は revise** が入口。
最終更新: 2026-07-11（scope-options 追加・全24スキル）

---

## どれを使う？（早見表)

| やりたいこと | 使うスキル |
|---|---|
| 曖昧な要望から新規プロダクトを立ち上げる | `/to-prd`（PRD＋リポジトリ作成）→ `/beam` |
| 既存システムに機能を追加する／リファクタする | `/power`（未整備リポジトリは power0 が準備） |
| 確定済みの仕様・設計を変更する | `/revise` |
| 1つの要望を松竹梅＋フルの4案で比較・選択したい | `/beam` 開始時に「4案提案を含める」（`scope-options`） |
| PR・ブランチ・ローカル変更をレビューする | `/code-review` |
| スライド資料を作る | `/slide-maker` |

## 全体フロー

```
【新規開発（グリーンフィールド）】
/to-prd ─► PRD＋Private リポジトリ作成
   └► /beam ─► beam1(note) → beam2(要件) → beam3(設計) → beam4(タスク)
                  │             │             │             │
                  └──── beam-sync（フェーズごとにスタックド PR → main）────┐
        （レビュー後 /clear して）/beam5-implement ─► tdd/direct へ委譲 ──┘

【既存への機能追加・リファクタ（ブラウンフィールド）】
/power ─► (power0 準備) → power1(scope＋featureブランチ) → power2(理解)
          → power3(差分設計) → power4(タスク) → power5(実装) → power6(検証・PR・再レビュー)

【横断】
/revise …… 仕様変更の再入口（影響導出→部分再生成→再キュー）
/code-review …… 多観点レビュー（beam/power の成果物が無くても動く）
```

---

## beam ファミリー（新規開発・7スキル）

| スキル | 役割 | 主な出力 | 連携 |
|---|---|---|---|
| **beam** | オーケストレーター。停止点（要件定義／設計／タスク分解まで）を選び beam1→4 を順次実行（beam5 は別途） | — | 各フェーズを Skill 実行 |
| **beam1-tasknote** | コンテキスト収集（PRD・規約・既存実装・Git 情報） | `docs/spec/{要件名}/note.md` | Explore 委譲・beam-sync |
| **beam2-requirements** | EARS 記法の要件定義＋ヒアリング | `requirements.md`・`user-stories.md`・`acceptance-criteria.md`・`interview-record.md`・`prep.md` | beam-sync |
| **beam3-design** | 技術設計（未解決事項の確定・prep.md 同期） | `design/`（architecture / dataflow / interfaces / database-schema / api-endpoints / design-interview） | service-boundary・beam-sync |
| **beam4-tasks** | タスク分解・SP 見積・**要件カバレッジゲート** | `TASK-*.md`・`overview.md`・`data/tasks.db`（スキーマの正） | estimate-storypoint・beam-sync |
| **beam5-implement** | 実装ディスパッチャ（フェーズ単位サブエージェント）。実データ検証・**要件適合ゲート**・drift 警告（→/revise） | `src/`・`code-map.md`・`conformance-report.md` | tdd/direct-implement・beam-sync |
| **beam-sync** | Git 連携（トランクベース。フェーズブランチ＋スタックド PR→トランク。秘密ガード・冪等） | ブランチ・PR | beam1〜5・revise から呼ばれる |

## power ファミリー（既存改修・8スキル）

| スキル | 役割 | 主な出力 | 連携 |
|---|---|---|---|
| **power** | オーケストレーター（readiness ゲート＋停止点。推奨: power4 まで→レビュー→/clear→5/6） | — | 各フェーズを Skill 実行 |
| **power0-onboard** | レガシー準備（2ステージ: devcontainer / CLAUDE.md / ガードレール配置 → Reopen → 依存・ビルド・**characterization テスト**） | `.devcontainer/`・`CLAUDE.md`・回帰ネット・（任意）`.beam/` ダッシュボード | 手動ハンドオフあり |
| **power1-scope** | スコープ確認（INT/REG/CON・[U]/[C] タグ・prep.md）＋ **`feature/{機能名}` ブランチ作成** | `docs/spec/{機能名}/feature-requirements.md`・`prep.md` | コード軽探索 |
| **power2-understand** | 既存理解（ドキュメント信頼度で探索量調整・並列 Explore） | `understanding-brief.md`・`docs/code-map.md`（**全体像＋索引**） | Explore 委譲 |
| **power3-design** | 差分設計（既存契約・規約に準拠） | `design/change-plan.md` ほか差分契約 | service-boundary（任意） |
| **power4-tasks** | タスク分解（beam4 互換 tasks.db・**回帰検証タスク**・要件＋回帰カバレッジゲート） | `TASK-*.md`・`overview.md`・tasks.db（テーブル=機能名） | estimate-storypoint |
| **power5-implement** | 実装ディスパッチャ（note/code-map を staging して橋渡し・フェーズごとコミット） | `src/`・code-map 更新 | tdd/direct-implement |
| **power6-verify** | 検証（実環境＋**回帰ガード**）・/code-review ループ（**CRITICAL/HIGH=0 で終了・最大2R**）・PR 作成＋PR 再レビュー。**upstream モードはクリーン PR**（process 生成物を除外） | `conformance-report.md`・PR | code-review |

## 横断スキル（2）

| スキル | 役割 | 備考 |
|---|---|---|
| **revise** | **仕様変更の再入口**（beam/power 共通）。影響を既存成果物から ID レベルで導出（🔵🟡🔴=影響判断の確からしさ）→承認→上流更新→下流の部分再生成→タスク再キュー→改定記録（`docs/revisions/`） | 再実装・再検証はしない（beam5/power5・ゲートに委譲）。beam の Git 反映は beam-sync 委譲 |
| **code-review** | PR 番号／ブランチ／ローカル差分を自動判別し、A〜K の多観点（セキュリティ P0/P1・ロジック・非同期・エラー処理・整合・実データ・要件適合・可読性・設計・性能・テスト/CI）でレビュー。**指摘の品質検証**で誤検知を除去し、信頼性レベル付きレポートを出力 | 同梱の `references/ai-security-guardrails.md` が P0/P1 の唯一の出典。最終承認は人間 |

## 共有エンジン（5・引数で要件名/機能名を受けるため beam/power 両対応）

| スキル | 役割 | 引数 |
|---|---|---|
| **tdd-implement** | 1タスクを TDD で実装（要件詳細化→テストケース→Red→Green→Refactor→完全性検証。AC→テスト 1:1 ゲート） | `{要件名} {TASK-ID}` |
| **direct-implement** | 1タスクの準備系作業（setup→verify。環境構築・設定・DB 初期化等） | `{要件名} {TASK-ID}` |
| **estimate-storypoint** | SP・不確実性バッファ・複雑度を JSON で算出（非フィボナッチ・小数1位・アンカー相対） | タスクファイル or インライン |
| **service-boundary** | Bounded Context 判定（既定モジュラモノリス・過分割抑止・「別製品級」は to-prd へのシグナル） | `{要件名}` or 機能一覧 |
| **scope-options** | 1つの要望から**ミニマム/要望/リッチ/フル**の4案を系統導出（Kano プロトコル＋EN/DS チェックリスト＋出典規律）し、SP 比較→案の選択→（非要望案なら）再整列を駆動。beam2（define）/beam4（estimate）から呼ばれる | `define {要件名}` / `estimate {要件名}` |

## 入口・その他（2）

| スキル | 役割 |
|---|---|
| **to-prd** | 曖昧な要望をインタビューで具体化 → PRD 生成 → テンプレートから Private リポジトリ作成・push（新規開発の入口） |
| **slide-maker** | スライド資料の作成（開発ワークフロー外の汎用スキル） |

---

## 共通規約（全スキル）

- **信頼性レベル**: 🔵 確実 / 🟡 妥当な推測 / 🔴 推測（revise の影響リストでは「影響あり」という判断の確からしさ）
- **フォルダ規約**: テンプレートのみ → `templates/`、他の参照ファイルも入る → `references/`、内部規約 → `rules/`
- **コーディング原則**: `code-review/references/coding-principles.md`（技法 ID A〜E の語彙集。DRY⇔AHA の張力・LLM の典型逸脱を含む）。**tdd-implement の Refactor と code-review の H/I レンズの共通出典**
- **スキル参照の解決順**: リポジトリ直下 `.claude/skills/` → `~/.claude/skills/`（repo 同梱が基本。マウントは使わない）
- **tasks.db**: スキーマの正は beam4（テーブル=要件名/機能名・status 4値・notion_sync_status 5値・JST）。ダッシュボード（`.beam/dashboard/`）が可視化
- **セキュリティ**: `docs/rule/ai-security-guardrails.md` の P0 は絶対遵守（レガシーには power0 が配置）。**AI 生成コードは人間がレビューし、最終責任を持つ。AI は最終承認者ではない**

## 更新・配布の手順

1. **編集はここ（`~/.claude/skills/`＝authoritative）で行う**
2. **開発用テンプレート**（**`template.conf` の `TEMPLATE_REPO`**）の `.claude/skills/` へ**ミラー同期**して push（`~/.claude/scripts/sync-skills.sh`。この README.md と `template.conf` も同じ相対位置へ複製される）
3. **配布用テンプレート**へは、出すと決めたときだけ反映する（`~/.claude/scripts/publish-company-template.sh`）。開発用テンプレートのコミット済みの中身をまるごと写し、`template.conf` だけを配布先の値に保つ。開発用で push した変更が、そのまま同僚に届かないようにするための段差
4. 既存の派生リポジトリは `/skills-update` で最新化する（`/power` を通すときは起動時に自動で走る）。取り込み元はそのリポジトリの `template.conf` が指すテンプレート

### `template.conf` — 個人名・組織名を持つ唯一のファイル

テンプレートリポジトリの場所（`TEMPLATE_REPO`）はこのファイルにだけ書き、スキル本文には書かない。to-prd・skills-update・power0-onboard はここを読む。**社内などへ展開するときは、展開先テンプレートの `template.conf` だけを書き換える。**

- 新規リポジトリの作成先は書かない（gh でログイン中のアカウント。組織の下に作るときだけ `REPO_OWNER`）。クローン先も書かない（`$HOME`）。どちらも実行する人ごとに違うため
- 開発用と配布用のテンプレートは、中身が同じで `template.conf` の1行だけが違う。配布用へは必ず手順3の反映スクリプトで出す（`sync-skills.sh` で直接書くと `template.conf` が開発用の値になり、配布先から作ったリポジトリが開発用テンプレートを見に行ってしまう）

## 関連ドキュメント

- `power/README.md` — power システムの概要と事前準備（クローン/fork・OSS ライセンス・ダッシュボード）
- 各スキルの `SKILL.md` — 実行ロジックの正
