# task-bridge マニュアル

Claude Code が DevContainer 内の開発作業で登録するタスク（ローカル SQLite に蓄積）を、
**Web UI で一覧表示し、選別したものを Notion に転送**するための個人用ブリッジアプリ。
さらに、beam ワークフローの**実装中にタスク進捗をリアルタイムに眺めるダッシュボード**としても使える。

- 対象環境: Windows 11 + VS Code DevContainer（Linux コンテナ）
- アクセス: コンテナ内で Web サーバーを起動し、ホスト側ブラウザから `http://localhost:3939`
- 言語: 日本語 / 個人利用・`localhost` バインド・認証なし

---

## 目次

1. [主な機能](#1-主な機能)
2. [技術スタック・構成](#2-技術スタック構成)
3. [セットアップ](#3-セットアップ)
4. [起動方法](#4-起動方法)
5. [動作モード（full / view）](#5-動作モードfull--view)
6. [ビューア専用モードについて](#6-ビューア専用モードについて)
7. [ダッシュボード（.beam/dashboard）](#7-ダッシュボードbeamdashboard)
8. [画面と使い方](#8-画面と使い方)
9. [ソース DB のスキーマ（beam 連携）](#9-ソース-db-のスキーマbeam-連携)
10. [API エンドポイント](#10-api-エンドポイント)
11. [hook 連携（ライブ更新・通知）](#11-hook-連携ライブ更新通知)
12. [テンプレートに配置するファイルの構成](#12-テンプレートに配置するファイルの構成)
13. [コマンド一覧](#13-コマンド一覧)
14. [トラブルシューティング](#14-トラブルシューティング)
15. [セキュリティ・制約](#15-セキュリティ制約)

---

## 1. 主な機能

- **タスク一覧表示**: ソース SQLite（`data/tasks.db`）の全プロジェクト（テーブル）のタスクを、プロジェクトごとの**表**で `task_id` 昇順に表示。列は `task_id / title / content / created_at / updated_at / status / notion_sync_status / is_deleted / update_badge` ＋操作列（詳細は[§8](#8-画面と使い方)）。直近更新行は `update_badge` でハイライト、削除待ち行は取り消し線。
- **Notion 登録**: `not_synced`／`sync_failed`（失敗の再試行）のタスクをワンクリックで Notion 登録。プロジェクト単位の「一括登録」も可（対象は `not_synced`＋`sync_failed`・進捗バー付き・バックグラウンド処理）。
- **Notion DB 自動作成**: 未作成のプロジェクトは `NOTION_PARENT_PAGE_ID` 配下に同名 DB を自動作成。
- **削除フロー**: Notion 連携済みタスクが DB から消えたら取り消し線付きで残し（`pending_deletion`）、連携処理で Notion ページを削除してから一覧から除く。未連携の削除は即時非表示。
- **リトライ**: Notion API 失敗時は最大 3 回自動リトライ。HTTP 429 は `Retry-After` に従う。最終失敗は `sync_failed` として一覧に残り、再クリックで再試行可。
- **通知**: Claude Code の hook（HTTP）を受信し 5 秒集約 → ブラウザ通知（Web Notifications）。UI のトグルで ON/OFF（ON 時にブラウザの通知許可を要求）。DevContainer 内でも動作する。
- **ライブ更新**: hook 受信を SSE で UI に反映（再取得・ハイライト）。
- **テーマ**: ライト/ダーク切替（ブラウザに保持）。
- **ログ**: 連携の成否・通知発火・DB エラー・起動/停止を `logs/app.log` に記録。100MB 超で自動ローテーション（5 世代）。
- **2 つの動作モード**: Notion 連携あり（full）/ 閲覧専用（view）。`.env` の有無で自動判定（[§5](#5-動作モードfull--view)）。

---

## 2. 技術スタック・構成

| 区分 | 採用 |
|---|---|
| 言語 / ランタイム | TypeScript（strict）/ Node.js 24（`.beam/dashboard/package.json` の engines で `24.x` に固定。DevContainer と同じ版） |
| パッケージマネージャ | pnpm |
| サーバー | Hono + `@hono/node-server` |
| DB | better-sqlite3（SQLite） |
| ログ | pino（`logs/app.log`） |
| フロントエンド | Vite + 素の TypeScript（フレームワークなし） |
| テスト | Vitest（単体）/ Playwright（E2E） |

### コンポーネント

```
ブラウザ(UI) ──HTTP/SSE──> Hono サーバー(127.0.0.1:3939)
                              ├─ TaskReader   … ソース DB(data/tasks.db) を readonly で読む
                              ├─ MetaStore    … メタ DB(data/app.db): 連携状態・スナップショット
                              ├─ NotionClient … Notion 公式 API（リトライ/429 追従）
                              ├─ Notifier     … 5 秒集約（通知はブラウザの Web Notifications で表示）
                              └─ 静的配信     … Vite 成果物(dist/web)
```

- ソース DB は **読み取り専用**で開くため、Claude Code が書き込み中でも安全に読める。
- メタ DB（`data/app.db`）は本アプリが連携状態を保持する書き込み先。

---

## 3. セットアップ

### 3.1 DevContainer

VS Code で「Reopen in Container」。`.devcontainer/post-create.sh` が以下を自動実行する：
1. 依存インストール（`pnpm install`）
2. Playwright（Chromium）導入
3. SQLite メタ DB 初期化
4. **ダッシュボード（`.beam/dashboard`＝task-bridge 本体）の依存導入＆ in-place ビルド**

### 3.2 環境変数（`.beam/dashboard/.env`）

`.beam/dashboard/.env.example` をコピーして `.beam/dashboard/.env` を作成し、値を設定する。

> **配置: ダッシュボードと同じディレクトリに置く（プロジェクトルートには置かない）。**
> ルートに置くと、同じリポジトリで動くアプリのフレームワーク（例: Next.js はルートの `.env` を
> 自動で読み込む）に混入し、`PORT` のような一般的な名前の変数が衝突する。

| 変数 | 必須 | 説明 |
|---|---|---|
| `NOTION_API_TOKEN` | full モードで必須 | Notion インテグレーションのトークン（`ntn_...` / `secret_...`） |
| `NOTION_PARENT_PAGE_ID` | full モードで必須 | プロジェクト DB を作る親ページ ID（ハイフンなし 32 桁） |
| `SOURCE_DB_PATH` | 必須 | 読み取るソース DB のパス（例 `/workspaces/<project>/data/tasks.db`） |
| `PORT` | 任意 | Web サーバーのポート（既定 `3939`、127.0.0.1 バインド） |
| `APP_DB_PATH` | 任意 | メタ DB のパス（既定 `data/app.db`） |

> **シークレットは `.beam/dashboard/.env` のみで管理**し Git に含めない（`.gitignore` の `.env` パターンはスラッシュを含まないため、どの階層でも除外される）。リポジトリには `.beam/dashboard/.env.example` のみ。

---

## 4. 起動方法

| 方法 | コマンド / 操作 | 用途 |
|---|---|---|
| 開発サーバー | `pnpm dev`（`tsx watch`） | 開発（ホットリロード） |
| 本番起動 | `pnpm start`（`node dist/server/index.js`） | ビルド済みを起動 |
| ビルド | `pnpm build` | server(tsc) + web(vite) |
| ダッシュボード | `bash .beam/dashboard/run.sh` または VS Code タスク「🔭 beam ダッシュボードを開く」 | 実装中の閲覧（[§7](#7-ダッシュボードbeamdashboard)） |

ブラウザで `http://localhost:3939/` を開く（DevContainer ではポート転送される）。

---

## 5. 動作モード（full / view）

| モード | Notion 連携 | 必要な `.env` | 用途 |
|---|---|---|---|
| **full** | あり（登録・削除・自動 DB 作成） | `NOTION_API_TOKEN` + `NOTION_PARENT_PAGE_ID` + `SOURCE_DB_PATH` | 通常運用 |
| **view** | なし（閲覧のみ） | `SOURCE_DB_PATH` のみ（未指定なら `data/tasks.db`） | 進捗監視・Notion 未設定環境 |

### モードの決まり方

- 環境変数 `BEAM_DASHBOARD_MODE`（`full` / `view`）が指定されていればそれを使う。
- 未指定なら **自動判定**：`.env` に `NOTION_API_TOKEN` と `NOTION_PARENT_PAGE_ID` が両方あれば `full`、無ければ `view`。

> ダッシュボード（`.beam/dashboard/run.sh`）はこの自動判定を行う。`.env` に Notion 資格情報があれば連携モード、なければ閲覧専用で起動する。

---

## 6. ビューア専用モードについて

**ビューア専用モード（view）** は、Notion 連携を使わずに**タスク一覧の閲覧とライブ更新だけ**を行うモード。

- **目的**: 実装中に `data/tasks.db` のタスク状況（`ready → in_progress → done` など）をリアルタイムに眺める。
- **特徴**:
  - `NOTION_API_TOKEN` 等が**不要**。`SOURCE_DB_PATH` だけ（未指定なら `data/tasks.db`）で起動できる＝**ゼロ設定で動く**。
  - メタ DB はダッシュボード専用（`.beam/dashboard/data/app.db`）に分離され、プロジェクト本体を汚さない。
  - **登録系ボタンは無条件で非活性**: Notion 連携不可のため「Notionに登録」「一括登録」「削除をNotionに反映」はすべて押せない（グレーアウト表示）。
- **画面表示**: view モードのときは画面上部に **`👁 閲覧専用モード（Notion 連携なし）`** の帯バッジが表示される（`GET /api/config` の `mode` を UI が判別）。Notion 連携モード（full）ではバッジは出ない。
- **Notion 連携モードへの切替**: `.env` に `NOTION_API_TOKEN` と `NOTION_PARENT_PAGE_ID` を設定して起動し直すと、自動判定により full モードで開く。

> 補足: full モードでも「自動で Notion に書き込む」ことはない（同期ボタンを押した時だけ）。

---

## 7. ダッシュボード（.beam/dashboard）

実装フェーズ中に、コードの隣でタスク進捗を眺めるためのツール。**task-bridge 本体一式を自己完結で `.beam/dashboard/` に配置**している（製品コードの場所であるプロジェクト直下の `src/` を占有しないため）。依存導入・ビルド・起動はこのディレクトリで行う。

### 起動・表示

- **自動起動**: `.vscode/tasks.json` の `runOn: folderOpen` タスクが、コンテナ/フォルダを開くと自動でサーバーを起動。
- **自動表示**: `forwardPorts:[3939]` + `onAutoForward: openPreview` により、**VS Code 内の Simple Browser タブ**で自動表示される。
- **再表示**: タブを閉じたら コマンドパレット → 「Tasks: Run Task」→ **「🔭 beam ダッシュボードを開く」**。`run.sh` がサーバーを起動し直し、ポート再検出でタブが再表示される。
- 許可プロンプト「自動タスクを許可しますか？」は `.vscode/settings.json` の `task.allowAutomaticTasks: "on"` で抑止済み。

### 起動スクリプト `run.sh` の挙動

- CWD を `.beam/dashboard` にして起動（静的 UI は `./dist/web`、メタ DB は `./data/app.db`）。
- `SOURCE_DB_PATH` は親プロジェクトの `../../data/tasks.db` を指す（どのプロジェクトでも一貫）。
- **同ディレクトリの** `.env` の Notion 資格情報を見てモード自動判定（[§5](#5-動作モードfull--view)）。full なら `--env-file=.env` を読み込む（CWD が `.beam/dashboard` のため相対で解決される）。
- PID ファイル（`dashboard.pid`）で再起動安全（再実行＝旧インスタンス停止→再起動→タブ再表示）。

---

## 8. 画面と使い方

| 操作 | 説明 |
| --- | --- |
| 一覧 | プロジェクトごとに**表**でグループ化、各グループ内は `task_id` 昇順（列は下記「表示カラム」） |
| 個別 Notion 登録 | タスク行の操作列「Notionに登録」（`not_synced` / `sync_failed` のとき活性。**view モードでは非活性**） |
| 一括 Notion 登録 | プロジェクト見出しの「一括登録」→ 進捗バー表示・他操作継続可（対象は `not_synced`＋`sync_failed`。**view モードでは非活性**） |
| 削除の反映 | 取り消し線（`pending_deletion`）行の「削除をNotionに反映」（**view モードでは非活性**） |
| 通知 ON/OFF | ヘッダのトグル（ON 時にブラウザの通知許可を要求。OFF でも一覧更新は継続） |
| テーマ | ライト/ダーク切替（リロードしても保持） |

### 表示カラム

一覧は次の列を**この順**で表示する（プロジェクト名は表の見出し `<h2>`、操作ボタンは末尾の「操作」列）。

| 列 | 表示 |
|---|---|
| タスクID（`task_id`） | 例 `TASK-0001` |
| タイトル（`title`） | タスク名 |
| 内容（`content`） | タスク概要。**小さいウィンドウでも半角40文字分（`min-width: 40ch`）の幅を確保**し、収まらなければ折り返し／横スクロール |
| 作成日時（`created_at`） | JST |
| 更新日時（`updated_at`） | JST |
| ステータス（`status`） | バッジ（未着手／進行中／レビュー中／完了） |
| Notion連携（`notion_sync_status`） | バッジ（未登録／登録中／登録済／削除待ち／失敗） |
| 削除（`is_deleted`） | **`✓`（削除）／`—`（通常）** |
| 更新（`update_badge`） | **`あり`／`なし`**（直近更新フラグ） |
| 操作 | 「Notionに登録」「削除をNotionに反映」ボタン（状態・モードに応じて活性/非活性） |

- 直近更新行（`update_badge` あり）は行全体がハイライト、削除待ち（`pending_deletion`）／削除（`is_deleted`）行はタイトルに取り消し線。

### ステータス値

- `status`: `ready` / `in_progress` / `in_review` / `done`
- `notion_sync_status`: `not_synced` / `synced` / `pending_deletion` / `sync_failed` / `syncing`

---

## 9. ソース DB のスキーマ（beam 連携）

ソース DB（`data/tasks.db`）は beam4 が生成する。task-bridge はこれを読む。

- **テーブル名 = 要件名（ケバブケース、例 `task-bridge`）**。ハイフンを含むため、識別子はダブルクォートで扱う。
- **`task_id` は TEXT**（例 `"TASK-0001"`）。数値ではなく文字列。
- 主な列: `task_id, title, content, status, notion_sync_status, is_deleted, update_badge, created_at, updated_at`（ほか `phase`, `story_point` 等）。
- task-bridge が「タスクテーブル」とみなす必須列: `task_id, title, content, status, created_at, updated_at`。

> 既存 DB を読むアプリでは「実スキーマ（テーブル名の命名規則・ID の型）」を前提に実装すること。テーブル名のハイフンや `TASK-XXXX` 文字列 ID を取りこぼすと一覧が空になる。

---

## 10. API エンドポイント

| メソッド・パス | 用途 |
|---|---|
| `GET /health` | 死活確認 |
| `GET /api/config` | 動作モード（`{ mode: "view" | "full" }`）。UI のバッジ判定に使う |
| `GET /api/tasks` | タスク一覧（プロジェクトごとにグループ化） |
| `GET /api/events` | SSE ストリーム（`tasks_changed` を push） |
| `POST /api/hook` | Claude Code からの更新イベント受信（`{type, project, taskId}`） |
| `POST /api/tasks/:project/:taskId/sync` | 個別 Notion 登録 |
| `POST /api/tasks/:project/:taskId/delete-sync` | 削除を Notion に反映 |
| `POST /api/projects/:project/sync` | 一括登録ジョブ開始 |
| `GET /api/jobs/:jobId` | 一括登録ジョブの進捗 |
| `GET /POST /api/notifications` | 通知 ON/OFF の取得・更新 |
| `GET /`, `GET /*` | 静的 UI（Vite 成果物 `dist/web`） |

---

## 11. hook 連携（ライブ更新・通知）

Claude Code（または beam5 / tdd-implement / direct-implement）が**タスクの status を更新するたび**に hook を叩くと、一覧が SSE で即時更新され、ブラウザ通知が出る（hook は best-effort・ダッシュボード未起動なら無視）。

```bash
curl -s -m 2 -X POST http://127.0.0.1:${BEAM_DASHBOARD_PORT:-3939}/api/hook \
  -H 'content-type: application/json' \
  -d '{"type":"status_changed","project":"<要件名>","taskId":"TASK-0001"}' >/dev/null 2>&1 || true
```

- `project` = 要件名（テーブル名）、`taskId` = `TASK-XXXX`。
- 通知は最初のイベントから 5 秒集約して 1 件にまとめる。

> 通知はダッシュボードを開いているブラウザが **Web Notifications** で表示します（`powershell.exe` やホスト常駐に非依存。**DevContainer 内でもそのまま動作します**）。表示にはヘッダの通知トグル ON とブラウザの通知許可が必要です（トグル ON 時に許可を要求）。SSE のライブ更新は通知設定に関わらず機能します。

---

## 12. テンプレートに配置するファイルの構成

ダッシュボードを**全 beam プロジェクトで使える**ようにするには、テンプレートリポジトリ
（`.claude/skills/template.conf` の `TEMPLATE_REPO`）に以下を配置する。

```
<テンプレートリポジトリ>/
├── .beam/
│   └── dashboard/                 # task-bridge 本体一式（自己完結。製品の src/ を占有しない）
│       ├── src/ test/             # アプリ本体（server/web/shared）とテスト
│       ├── package.json           # 依存＋ビルド/テスト/起動スクリプト
│       ├── tsconfig*.json / vite.config.ts / vitest.config.ts / playwright.config.ts / eslint.config.js
│       ├── run.sh                 # 起動スクリプト（モード自動判定・PID 管理）
│       ├── README.md              # ダッシュボード本体の説明
│       ├── .gitignore             # dist/ node_modules/ data/ logs/ dashboard.pid を無視
│       └── dist/                  # ★ ビルド成果物。postCreate で in-place ビルド（コミットしない）
│
├── .devcontainer/
│   ├── devcontainer.json          # forwardPorts:[3939] + portsAttributes(openPreview) + postCreate
│   └── post-create.sh             # .beam/dashboard の依存導入＆ in-place ビルド + gh 認証セットアップ
│
├── .vscode/
│   ├── tasks.json                 # 「🔭 beam ダッシュボードを開く」(runOn: folderOpen)
│   └── settings.json              # task.allowAutomaticTasks: "on"（自動タスク許可プロンプト抑止）
│
├── docs/
│   └── rule/
│       └── ai-security-guardrails.md   # セキュリティ・ガードレール（AI 常時参照）
│
├── CLAUDE.md                      # プロジェクト指示書（@docs/rule/... をインポート、beam 構成を記載）
└── .beam/dashboard/.env.example  # NOTION_API_TOKEN / NOTION_PARENT_PAGE_ID / SOURCE_DB_PATH / PORT
                                  # （ダッシュボード専用。ルートには置かない）
```

### 配置上のポイント

| 項目 | 方針 |
|---|---|
| `dist/`（ビルド成果物） | **コミットしない**。`post-create.sh` が `.beam/dashboard` 内で `pnpm install && pnpm build`（in-place）して生成する。 |
| `node_modules/`（ダッシュボード） | `post-create.sh` が `pnpm --dir .beam/dashboard install` で導入（better-sqlite3 をネイティブビルド） |
| `data/` `logs/` `dashboard.pid` | 生成物（`.gitignore` 済み） |
| `SOURCE_DB_PATH` | `.beam/dashboard/run.sh` は `../../data/tasks.db` を参照するため、各プロジェクトの `data/tasks.db` を自動的に見る |
| 権限 | ビルドは **node ユーザー**で実行する（root で実行すると `dist/` が root 所有になり、次回 build が `EACCES` になる） |

### post-create.sh に含める処理（要点）

```bash
pnpm --dir .beam/dashboard install          # 依存導入（better-sqlite3 ネイティブビルド）
pnpm --dir .beam/dashboard build            # server + web を .beam/dashboard/dist へ（in-place）
mkdir -p data .beam/dashboard/data          # ソース tasks.db はルート data/、メタ DB は .beam/dashboard/data/
```

---

## 13. コマンド一覧

| 目的 | コマンド |
|---|---|
| 依存インストール | `pnpm install` |
| 開発サーバー | `pnpm dev` |
| 本番起動 | `pnpm start` |
| ビルド | `pnpm build` / `pnpm build:server` / `pnpm build:web` |
| 型チェック | `pnpm typecheck` |
| 単体テスト | `pnpm test` |
| E2E テスト | `pnpm test:e2e` |
| Lint / Format | `pnpm lint` / `pnpm format` |
| ダッシュボード起動 | `bash .beam/dashboard/run.sh` |

---

## 14. トラブルシューティング

| 症状 | 原因・対処 |
|---|---|
| 一覧が空（`projects:[]`） | ソース DB のテーブル名が読み取り対象外。テーブル名にハイフン（ケバブケース）が含まれていないか、必須列があるか確認。`SOURCE_DB_PATH` が正しいか確認 |
| 起動時に `必須の環境変数が設定されていません: ...` | full モードで `NOTION_*` 等が未設定。`.env` を設定するか、view モードで起動（`BEAM_DASHBOARD_MODE=view`） |
| `EADDRINUSE: ... 3939` | 既に同ポートで起動中。`run.sh` は PID ファイルで再起動するが、別経路で起動した残プロセスは手動停止（`fuser -k 3939/tcp` 等） |
| ビルドが `EACCES: ... dist/web/assets` で失敗 | `dist/` が root 所有。`sudo chown -R node:node dist .beam` で node 所有に戻す（root でビルドしないこと） |
| ダッシュボードのタブが自動で開かない | DevContainer を再オープン（`tasks.json` / `devcontainer.json` は再オープンで反映）。それでも出なければ コマンドパレット →「Simple Browser: Show」で URL を開く |
| 閲覧専用バッジが消えない／出ない | `GET /api/config` の `mode` を確認。`.env` の Notion 資格情報の有無で view/full が決まる |
| Notion 同期が失敗（`sync_failed`） | トークン/親ページ ID の有効性、Notion 側の権限を確認。一覧に残るので個別「Notionに登録」の再クリック、または「一括登録」で再試行できる（`sync_failed` も一括対象） |

---

## 15. セキュリティ・制約

- **localhost バインド + HTTP のみ**・**認証なし**（個人利用前提・外部到達不能）。
- **シークレットは `.env` のみ**。Git・クライアントに含めない。ログにも出さない。
- ソース DB は **readonly** で開く。
- Notion API は最大 3 回リトライ・429 は `Retry-After` 追従。
- 想定: PC ブラウザのみ（モバイル非対応）・日本語表示・完全無料（追加有料サービス非依存）。
- 表示上限の目安: タスク 1,000 件まで（5 秒以内描画）。

---

*本マニュアルは task-bridge のソース・設計（docs/spec, docs/design）と実装に基づく。詳細仕様は各プロジェクトの `docs/` を参照。*
