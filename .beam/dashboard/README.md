# beam dashboard（task-bridge 本体）

実装中に **`../../data/tasks.db`（beam4 が作るタスク DB）の状況をブラウザで眺める**ための開発補助ツール
「task-bridge」の本体一式です。製品コードの場所（プロジェクト直下の `src/`）を占有しないよう、
このツールはここ（`.beam/dashboard/`）に**自己完結**で配置されています。

- ローカル SQLite DB（プロジェクト＝テーブル）のタスクを Web UI で一覧表示
- 実装スキルからの hook を受けて SSE でライブ更新し、ブラウザ通知（Web Notifications）で知らせる
- 任意のタスクを個別／プロジェクト単位の一括登録で Notion に転送（full モード時）

> 画面の見方・表示カラム・API・hook 連携などの**利用マニュアル**は
> [../../task-bridge-manual.md](../../task-bridge-manual.md) を参照。

## 技術スタック

- ランタイム/言語: Node.js 22 + TypeScript（strict mode）
- HTTP フレームワーク: Hono（`@hono/node-server` で Node 上に起動）
- フロントエンド: 素の HTML + TypeScript（Vite でビルド）
- SQLite クライアント: better-sqlite3（同期 API・ネイティブビルド）
- ロガー: pino（`logs/app.log`・100MB ローテーション）
- テスト: Vitest / Lint: ESLint / Format: Prettier / パッケージマネージャー: pnpm

## 構成

```
.beam/dashboard/
├── src/             # アプリ本体（server / web / shared）
├── test/            # テスト（unit / e2e）
├── package.json     # 依存＋ビルド/テスト/起動スクリプト
├── tsconfig*.json / vite.config.ts / vitest.config.ts / playwright.config.ts / eslint.config.js
├── run.sh           # 起動スクリプト（モード自動判定・未ビルドなら自動ビルド）
├── dist/            # ビルド成果物（server + web）。post-create で生成（.gitignore）
└── data/            # ダッシュボード専用メタ DB（app.db）。自動生成（.gitignore）
```

## セットアップ / ビルド

devcontainer の postCreate（`../../.devcontainer/post-create.sh`）が自動で実行する。手動で行う場合:

```bash
cd .beam/dashboard
pnpm install     # better-sqlite3 をネイティブビルド
pnpm build       # server + web を dist/ へ
```

> pnpm v10 以降は依存のビルドスクリプトを既定でブロックするため、`package.json` の
> `pnpm.onlyBuiltDependencies` に `better-sqlite3` / `esbuild` を許可済み。
> ネイティブモジュールの読込に失敗する場合は `pnpm rebuild better-sqlite3` を実行する。

## 起動

```bash
bash .beam/dashboard/run.sh          # どこからでも可（dist が無ければ自動ビルド）
```

- **モード自動判定**: **このディレクトリの** `.env`（`.beam/dashboard/.env`）に `NOTION_API_TOKEN` と
  `NOTION_PARENT_PAGE_ID` が両方あれば **full**（Notion 連携）、無ければ **view**（閲覧専用・画面上部にバッジ表示）。
- 既定ポート `3939`（`BEAM_DASHBOARD_PORT` で変更）。`http://localhost:3939/` で一覧表示。
- ソース DB は `../../data/tasks.db` を**読み取り専用**で参照する（実装側の書き込みと安全に併存）。
  **まだ存在しない場合も空一覧（「表示できるタスクがありません。」）で起動**し、
  beam4 が DB を作成したら以降の読取で自動的に表示される。
- devcontainer では `.vscode/tasks.json`（`runOn: folderOpen`）が `run.sh` を自動起動し、
  ポート 3939 が VS Code 内タブで自動表示される。

## 環境変数（`.env` はこのディレクトリに置く）

`.env.example` をコピーして `.env` を作成する（Git 管理外。コミット禁止）。

```bash
cp .beam/dashboard/.env.example .beam/dashboard/.env
```

> **プロジェクトルートには置かないこと。** ルートに `.env` を置くと、同じリポジトリで動くアプリの
> フレームワーク（例: Next.js はルートの `.env` を自動で読み込む）に混入し、`PORT` のような
> 一般的な名前の変数が衝突する。ダッシュボードの設定はダッシュボードと同じ場所に置く。

| 変数 | 説明 | 既定 |
|---|---|---|
| `NOTION_API_TOKEN` | Notion インテグレーションのトークン | （full モードに必須） |
| `NOTION_PARENT_PAGE_ID` | プロジェクト DB を自動作成する親ページ ID | （full モードに必須） |
| `SOURCE_DB_PATH` | ソース SQLite DB のパス（読取専用） | `../../data/tasks.db` |
| `PORT` | Web サーバーのポート（`127.0.0.1` バインド） | `3939` |
| `APP_DB_PATH` | アプリメタ DB のパス | `data/app.db` |

> 相対パスは**このディレクトリ（`.beam/dashboard/`）基準**で解決される（run.sh が CWD をここに固定して起動するため）。

## 開発コマンド（このディレクトリで実行）

| 目的 | コマンド |
|---|---|
| サーバー開発起動 | `pnpm dev`（フロントは `pnpm dev:web`） |
| ビルド（server + web） | `pnpm build` |
| 型チェック | `pnpm typecheck` |
| テスト | `pnpm test` |
| Lint / フォーマット | `pnpm lint` / `pnpm format` |

## ライブ更新 / 通知（ブラウザ通知）

- 実装フェーズ（beam5 / tdd-implement / direct-implement）がタスク更新時に `POST /api/hook` を
  best-effort で叩くと、一覧が SSE で即時更新される。
- 通知は 5 秒集約後に、ダッシュボードを開いているブラウザが **Web Notifications** で
  「タスク更新 / N件のタスクが更新されました」を表示する（ホスト常駐や `powershell.exe` に非依存）。
  **DevContainer 内でもそのまま動作する。**
- **有効化**: ヘッダの通知トグルを ON にし、ブラウザの通知許可で「許可」する（トグル ON 時に許可を要求）。
  通知本文は更新「件数」のみで、タスク本文やトークンは含めない。SSE のライブ更新は通知設定に関わらず機能する。

## トラブルシューティング

- `better-sqlite3` の `ERR_DLOPEN_FAILED` / ネイティブモジュール読込失敗:
  `pnpm rebuild better-sqlite3` を実行する。Node のメジャーバージョンを変えた場合も再ビルドが必要。
- 「表示できるタスクがありません。」のまま: `data/tasks.db` は beam4 が生成する。beam4 完了後に
  表示される（実装中は hook 経由で自動更新。反映されない場合はページを再読み込み）。
- 通知が表示されない: ヘッダの通知トグルが ON か、ブラウザの通知許可が「許可」かを確認する
  （ブロック中はブラウザのサイト設定で許可に変更。OS の集中モードも抑制要因）。
- 起動に失敗する・`dist/` が無い: `bash .beam/dashboard/run.sh` が自動ビルドする。
  それでも失敗する場合は上記「セットアップ / ビルド」を手動実行する。
