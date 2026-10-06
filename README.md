# claudecode-template-for-devcontainer

Claude Code + DevContainer で「曖昧な要望 → PRD → 要件定義 → 設計 → タスク分解 → 実装」までを
自動で進める **beam ワークフロー内蔵** の開発テンプレートです。

このテンプレートから作ったリポジトリは、開くだけで次が揃います。

- **beam システム（開発の自動化）** — `.claude/skills/` に同梱されたスキル群が、要件定義から実装・
  Git 連携（フェーズ別 PR 作成）までを対話で自動化します。**これがこのテンプレートの本体です。**
- **タスクダッシュボード（task-bridge）** — フォルダを開くと自動起動し、実装タスクの進捗を
  ブラウザ（http://localhost:3939）でリアルタイム表示。Notion へのタスク転送もできます。
- **DevContainer 完結** — Node 24 / pnpm / GitHub CLI / Claude Code を設定済み。ホスト環境を汚しません。

---

## クイックスタート

**「コンテナ起動セット」をダウンロードし、中の `利用方法.html` を開いて、その手順に従ってください。**
準備から、PRD とリポジトリの作成、DevContainer で開く、beam で開発を始めるところまでを、このページ1枚で案内しています。
準備の大部分は、ページにある「準備用プロンプト」を Claude デスクトップアプリに貼り付けるだけで、Claude が行います。

1. [コンテナ起動セット（container-starter-kit.zip）](https://raw.githubusercontent.com/acs-sa-okamoto/claudecode-template-for-devcontainer/main/container-starter-kit.zip) をダウンロードする
2. 展開し、`コンテナ起動セット` フォルダの中の `利用方法.html` をブラウザで開く
3. `利用方法.html` の手順に従う

使うもの: Claude デスクトップアプリ・WSL2（Ubuntu）・WSL に入れる Docker Engine・VS Code（Docker Desktop は使いません）

> リンクからダウンロードできないときは、[container-starter-kit.zip のページ](./container-starter-kit.zip) を開き、右上の「Download raw file」ボタン（下向き矢印）から取得してください。

---

## beam ワークフロー（このテンプレートの本体）

| 順序 | スキル | 役割 | 主な成果物 |
|---|---|---|---|
| 0 | `to-prd` | 要望の具体化・PRD 作成・リポジトリ初期化 | `docs/spec/{要件名}/product-requirements.md` |
| 1 | `beam1-tasknote` | コンテキスト収集 | `note.md` |
| 2 | `beam2-requirements` | 要件定義（EARS） | `requirements.md` ほか |
| 3 | `beam3-design` | 技術設計 | `design/*` |
| 4 | `beam4-tasks` | タスク分解・SP 見積もり | `overview.md`, `TASK-XXXX.md`, `data/tasks.db` |
| 5 | `beam5-implement` | 実装（TDD / DIRECT をフェーズ単位で委譲） | `src/` のコード |
| − | `beam-sync` | Git 連携（各フェーズ完了時に自動実行） | フェーズ専用ブランチへのコミット＋スタックド PR（最後に `gh stack merge` でまとめてトランクへ） |

- 要件 → タスク → 実装のトレーサビリティをゲートで担保します（要件カバレッジ照合・AC とテストの 1:1・要件適合レポート）。
- 全体アーキテクチャ・実行フロー・Git 連携の詳細: [beam-architecture.md](./beam-architecture.md)
- プロジェクト固有の指示書は [.claude/CLAUDE.md](./.claude/CLAUDE.md)（`{ }` を記入して使います）。

---

## 既存システムへの機能追加（power）

ゼロから作るのではなく、**すでにあるシステムに機能を足す・リファクタリングする**ときは `/power` を使います（beam の姉妹版）。既存コードを読んで図にし、壊してはいけない既存の挙動を洗い出してから、設計・実装・回帰検証まで進めます。

このテンプレートから作っていないリポジトリ（社内の既存システムなど）にはスキルが入っていません。その場合も **PC ではなく、そのリポジトリにスキル一式をコピー**します（手順は [.claude/skills/power/README.md](./.claude/skills/power/README.md)）。以後は `/power` が起動のたびにリポジトリのスキルを最新にします。PC に入れないのは、同じ名前のスキルが PC にもあると Claude Code が PC 側を優先して使い、リポジトリ側を最新にしても効かなくなるためです。

DevContainer が無いリポジトリでは、最初の `/power` で power0 が DevContainer を作ります。PR の作成に要る道具（Claude Code・gh のログインの共有・gh-stack・sqlite3）は「土台」として一緒に入り、既存の DevContainer があればそれに足します。

## スキルの更新

スキルはリポジトリごとに同梱して配っているので、**テンプレート側が新しくなっても、手元のリポジトリは自動では変わりません**。最新を取り込むには `/skills-update` を実行します（`/power` は起動のたびに自動で行います）。差分だけ見たいときは `/skills-update --check`。

- 取り込み元のテンプレートは `.claude/skills/template.conf` で決まります。
- リポジトリ側でスキルを直接書き換えていた場合、その変更は上書きされます（Git で確認・復元できます）。

全スキルの一覧と使い方: [.claude/skills-catalog/00-index.md](./.claude/skills-catalog/00-index.md)

---

## タスクダッシュボード（task-bridge）

beam4 が生成する `data/tasks.db` を読み取り専用で監視し、実装タスクの一覧・進捗・Notion 連携を
ブラウザで提供する開発補助ツールです。フォルダを開くと自動起動し、VS Code 内タブ（ポート 3939）に表示されます。

- タスク DB がまだ無い段階（beam4 より前）は「表示できるタスクがありません。」と表示されます。
- アプリ本体・セットアップ・環境変数・開発コマンドの詳細: [.beam/dashboard/README.md](./.beam/dashboard/README.md)
- 利用マニュアル（画面の見方・表示カラム・API・hook 連携・トラブルシューティング）: [task-bridge-manual.md](./task-bridge-manual.md)

### Notion 連携の設定（任意）

タスクダッシュボードの Notion 連携（full モード）に必要です。**`.beam/dashboard/.env.example` を真似て `.beam/dashboard/.env` を作成**してください。

```bash
cp .beam/dashboard/.env.example .beam/dashboard/.env   # → NOTION_API_TOKEN / NOTION_PARENT_PAGE_ID を記入
```

> **注: この `.env` はダッシュボード専用であり、プロジェクトルートには置きません。**
> ルートに置くと、同じリポジトリで動くアプリのフレームワーク（例: Next.js はルートの `.env` を
> 自動で読み込む）に混入し、`PORT` のような一般的な名前の変数が衝突します。
> 製品コード側の環境変数は、そのアプリ自身の作法（Next.js なら `.env.local`）で管理してください。

> `.env` が無くても起動はします（**view モード** = 閲覧専用。画面上部にバッジが出ます）。
> その他の変数（`SOURCE_DB_PATH` など）は既定値のままで動きます。
> 値の取得手順は [task-bridge-manual.md](./task-bridge-manual.md) を参照。`.env` は Git 管理外です（コミット禁止）。

---

## 構成

```
.
├── .claude/            # Claude Code 設定（CLAUDE.md・beam スキル群）
├── .devcontainer/      # DevContainer 定義（post-create で自動セットアップ）
├── .beam/dashboard/    # task-bridge 本体（開発補助ツール・自己完結）
├── docs/rule/          # セキュリティ・ガードレール（AI が常時参照）
├── docs/spec/{要件名}/ # beam が生成する要件・設計（to-prd 以降に作られる）
├── data/tasks.db       # beam4 が生成するタスク DB（Git 管理外）
├── src/                # 製品コード（beam5 が実装）
├── .beam/dashboard/.env.example  # ダッシュボード用サンプル（→ 同ディレクトリに .env を作成）
└── package.json ほか   # TS/Node 既定スターター
```

> ルート直下の `package.json` / `tsconfig.json` / `.prettierrc` / `eslint.config.js` は
> **TypeScript/Node 向けの「既定のスターター」**であり、言語・スタックを限定するものではありません。
> 設計（beam3）で別のスタックを選んだ場合は、置き換え・削除して構いません。
