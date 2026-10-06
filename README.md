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

### 0. 前提

WSL2（Ubuntu）・Docker・VS Code ＋ Dev Containers 拡張・Claude Code を用意し、**WSL の中で** GitHub CLI にログインしておきます（`gh auth login`）。

あわせて、**WSL の git に名前とメールアドレスを設定**しておきます。設定していないと、to-prd が PRD をコミットするところで止まります（DevContainer の中でも同じ設定が使われます）。

```bash
git config --global user.name "あなたの名前"
git config --global user.email "あなたのメールアドレス"
```

**Docker は次のどちらか一方**を使います（同じ WSL で両方を使うと、ぶつかって動きません）。to-prd（下の「1. リポジトリを作る」）だけなら Docker は要らず、「2. DevContainer で開く」から必要になります。

- **Docker Desktop**: Windows では一番手軽です。ただし Docker 社の利用条件では、従業員 250 人以上または年間売上 1,000 万ドル以上の企業が業務で使う場合、有料の契約が必要です。会社の契約状況を確認してから使ってください。
- **WSL に入れた Docker Engine**: 無料です。手順は下にあります。VS Code は、WSL から開いたフォルダでは WSL の中の Docker を使うので、設定の変更は要りません（フォルダは必ず WSL から開きます）。

<details>
<summary>WSL に Docker Engine を入れる手順（Docker Desktop を使わない場合）</summary>

Docker Desktop が入っていて、この WSL との連携（Docker Desktop の Settings → Resources → WSL integration）が有効なら、先に Docker Desktop をアンインストールするか、連携を切ってください。以下は、すべて WSL のターミナルで実行します（Ubuntu 22.04 と 24.04 で確認済み）。

1. **systemd が動いているか確かめる。** `ps -p 1 -o comm=` で `systemd` と出れば 2 へ進みます。出ないときは次を実行し、Windows の PowerShell で `wsl --shutdown` してから WSL を開き直します（既にある `/etc/wsl.conf` の設定は消しません）。

   ```bash
   grep -q '^\[boot\]' /etc/wsl.conf 2>/dev/null || printf '\n[boot]\nsystemd=true\n' | sudo tee -a /etc/wsl.conf > /dev/null
   ```

   それでも `systemd` と出ないときは、`/etc/wsl.conf` に `[boot]` が既にあって `systemd=true` が無い状態です。`[boot]` の下に `systemd=true` を書き足して、もう一度 `wsl --shutdown` します。

2. **Docker の公式リポジトリを登録して、Docker Engine を入れる。** 最初の `sudo -v` でパスワードを入力しておくと、残りをまとめて貼り付けても途中で止まりません。

   ```bash
   sudo -v
   sudo apt-get update
   sudo apt-get install -y ca-certificates curl
   sudo install -m 0755 -d /etc/apt/keyrings
   sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
   sudo chmod a+r /etc/apt/keyrings/docker.asc
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   sudo apt-get update
   sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```

3. **WSL を起動したら Docker も自動で起動するようにする。**

   ```bash
   sudo systemctl enable --now docker
   ```

4. **sudo なしで docker を使えるようにする。** 実行したら WSL のターミナルを開き直します（反映されないときは PowerShell で `wsl --shutdown` してから開き直します）。

   ```bash
   sudo usermod -aG docker $USER
   ```

5. **動作確認。** `Hello from Docker!` と出れば完了です。

   ```bash
   docker run --rm hello-world
   ```

</details>

### 1. リポジトリを作る

`to-prd` スキルが、インタビューで要望を具体化し、このテンプレートから新規 Private リポジトリの作成と PRD の生成・コミットまで自動で行います。新しいリポジトリはあなたの GitHub アカウントの下に作られ、WSL のホームにクローンされます。to-prd を動かす方法は2つあり、どちらでも結果は同じです。

**方法A: このテンプレートをクローンして、その中で使う**（準備が少ない）

1. このリポジトリを **WSL に**クローンする（GitHub の「Code」ボタンの URL で `git clone`）
2. クローンしたフォルダで Claude Code を起動し（WSL のターミナルで `claude`、または Claude Code アプリでこのフォルダを開く）、「PRD を作りたい」または `/to-prd` と伝える

to-prd を更新するときは、クローンしたフォルダで `git pull` します。

**方法B: PC に to-prd だけを入れて、どこからでも使う**

このリポジトリから次の **2つだけ** を取り出し、自分の Claude Code が読むスキルの置き場所にコピーします。

```
.claude/skills/template.conf    ← 必須。どのテンプレートから作るかが書いてある（無いと to-prd は止まる）
.claude/skills/to-prd/          ← フォルダごと
```

- 取り出し方: GitHub の「Code」→「Download ZIP」で取得し、展開した中から上の2つを取る
- コピー先: Windows の Claude Code アプリなら `C:\Users\<ユーザー名>\.claude\skills\`、WSL のターミナルで `claude` を使うなら WSL の `~/.claude/skills/`（この2つは別の場所です）
- `skills` フォルダを初めて作った場合は、Claude Code で `/reload-skills` を実行するか、Claude Code を再起動する
- PC に置いた to-prd は自動では更新されません。テンプレート側で to-prd が大きく変わったら、同じ手順で置き直します（to-prd が作るリポジトリには、その時点の最新のテンプレートが入るので、影響は to-prd 自体の聞き取りと PRD の書式に限られます）

> **⚠️ PC に入れるのは to-prd だけにしてください。スキル一式を PC に入れてはいけません。**
> 同じ名前のスキルが PC（`~/.claude/skills/`）とリポジトリ（`.claude/skills/`）の両方にあると、Claude Code は **PC 側を使います**（Claude Code の仕様）。一式を PC に入れると、リポジトリを `/skills-update` や `/power` で最新にしても使われず、**PC にコピーした時点の古いスキルのまま、気づかないうちに動き続けます**。
> PC に要るのは、リポジトリがまだ存在しない段階で動く to-prd だけです。それ以外のスキルは、to-prd が作るリポジトリに同梱されています。

**共通の注意**

- **DevContainer の中では to-prd を実行しないでください。** 新しいリポジトリがコンテナの中にクローンされ、コンテナを作り直すと消えます。
- どのテンプレートから作るかは `template.conf` で決まります（このリポジトリから取ったものは、このリポジトリ自身を指しています）。

手動で作る場合は、GitHub の **Use this template** からリポジトリを作成します。

### 2. DevContainer で開く

WSL のターミナルでクローンしたフォルダに移り、`code .` で VS Code を開いてから「**Dev Containers: コンテナーで再度開く**」を実行します（必ず WSL から開きます。WSL の gh のログインをコンテナで使うため、また WSL に入れた Docker Engine を使う場合も、この開き方で使われます）。
初回は post-create が依存インストール・ダッシュボードのビルド・gh 認証設定を自動で行います。

### 3. 初期設定（.env）— task-bridge 用

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

### 4. beam で開発を進める

VS Code にて新しいターミナルを開き「**claude**」と入力すると Claude Code が立ち上がります。
Claude Code に「**beam を実行**」と伝えると、オーケストレーターが各フェーズを対話で進めます。
進捗は自動で開くタスクダッシュボードで確認できます。

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

このテンプレートから作っていないリポジトリ（社内の既存システムなど）にはスキルが入っていません。その場合も **PC ではなく、そのリポジトリにスキル一式をコピー**します（手順は [.claude/skills/power/README.md](./.claude/skills/power/README.md)）。以後は `/power` が起動のたびにリポジトリのスキルを最新にします。PC に入れない理由は、上の「方法B」の注意と同じです。

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
