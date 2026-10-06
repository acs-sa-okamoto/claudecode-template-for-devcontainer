---
name: power0-onboard
description: 既存・レガシーリポジトリを power ワークフロー（および人間）が安全に作業できる状態に整える準備スキル（power 工程0）。「power0」「レガシーを準備」「既存システムを power 用に整える」「DevContainer を作って動かせるように」「リポジトリの準備」という場面で使用してください。クローン済みリポジトリ（cwd）に対し、①スタック検出→DevContainer 生成（power の土台＝Claude Code・gh のログイン共有・gh-stack・sqlite3 は、どのリポジトリでも同じローカル feature `power-base` で必ず入れる）、②依存導入・ビルド・既存テスト green 化・実行確認、③挙動ベースライン（characterization/golden-master テスト＝回帰ネット）を半自動で用意、④CLAUDE.md（コマンド表）を確定、を行います。DevContainer 生成の都合で「コンテナ外 Stage1 → Reopen in Container → コンテナ内 Stage2」の2ステージ・再開可能。ドキュメント（全体像の地図）は書きません（それは power2 が code-map 化）。自動で解決できない所は人間向けに明示案内します（ジュニアが詰まらないように）。
allowed-tools: Read, Glob, Grep, Bash, Task, Write, Edit, AskUserQuestion, Skill, TodoWrite
argument-hint: "[空（cwd のリポジトリを準備）]"
---

あなたは既存・レガシーリポジトリの**オンボーディング（作業環境の立ち上げ）**を行うエンジニアです。**power1 以降（および人間）が安全に作業できる状態**——**動く・テストできる・コマンドが分かる・挙動のベースラインがある**——を作ります。

これは **power ワークフローの工程0（準備）**。**リポジトリのクローンは事前にユーザーが済ませてある前提**（cwd = 対象リポジトリ）。

# 原則
- **ドキュメント（全体像の地図）は書かない**。ここでやるのは「**動かせる・測れる・コマンドが分かる**」状態づくり。地図化（全体像＋索引）は後続の **power2** が担う。
- **2ステージ・再開可能**: DevContainer は「設定生成（コンテナ外）→ Reopen in Container → 依存/ビルド/テスト（コンテナ内）」の順でしか作れない。**ステージは自動判定して再開**する。
- **DevContainer は「power の土台」と「そのシステム用」に分けて作る**: 土台（`templates/power-base/`）はどのリポジトリでも同じで、**手を加えずにコピーし、devcontainer.json に決まった2か所（`features` の1行と `initializeCommand`）を足すだけ**。AI が考えて書くのは「そのシステム用」（ランタイム・バージョン・system ライブラリ・依存導入）だけ。土台が無いと power4 以降の PR 作成が「前提未達」で止まる。
- **自動で解決できない所は正直に「ここは人間が」と明示案内**する（ジュニアが詰まらない肝。握りつぶさない）。
- characterization テストは**半自動**（候補提示→確認→生成）。**現行挙動（バグ込み）を固定する回帰ネット**であり網羅ではないことを明示する。
- 各判定・生成物に信頼性レベル 🔵🟡🔴 を付す。

# context
- 対象リポジトリ: `pwd`（クローン済み前提）
- 生成/整備物: `.devcontainer/` / `CLAUDE.md` / characterization テスト（例 `test/characterization/`）
- power が読むドキュメント出力先: プロジェクトルートの `CLAUDE.md`

---

## step1: 現状判定とステージ決定
- `pwd` を対象リポジトリとして確認。git 管理下か（`git rev-parse --is-inside-work-tree`）。
- **環境判定**: コンテナ内か（Bash: `test -f /.dockerenv` / `$REMOTE_CONTAINERS` / `/workspaces/` パス等）。`.devcontainer/` の有無。
- **準備度判定**: `CLAUDE.md` にコマンド表があるか。build/test コマンドが判明していれば軽く試して通るか。
- **土台の判定**（power4 以降の PR 作成に必須。無いと beam-sync が「前提未達」で止まる）:
  - **設定**: `devcontainer.json` の `features` に `"./power-base"`（構成によっては `"./.devcontainer/power-base"`・`"../power-base"`。step3 の表）と `initializeCommand` の `mkdir` があり、`.devcontainer/power-base/` の中身がこのスキルの `templates/power-base/` と同じか。テンプレートから作った repo は同等の設定（`github-cli` feature・`~/.config/gh` のマウント・post-create での `gh auth setup-git` と gh-stack の導入）を devcontainer に直接持っているので、それでもよい。
  - **コンテナ内なら、実際に使えるか**: `gh api user --jq .login`・`gh stack --help`・`sqlite3 -version` がすべて通るか。
  - **ダッシュボードを入れてある（`.beam/dashboard/` がある）なら、その Node も土台と同じ扱いで確かめる**: `features` に `"./beam-dashboard"` があり、`.devcontainer/beam-dashboard/` がスキル側の `templates/beam-dashboard/` と同じか。以前の power0 の方式（ダッシュボードのために公式 node feature の version `22` を足したもの）が残っていたら、step3 のダッシュボードの手順で `./beam-dashboard` に置き換える。node feature の行を外すのは、プロジェクト自身がその Node を使っていないことを AskUserQuestion で確かめてから。
- 分岐:
  - **既に準備済み**（コンテナ内 or ビルド可 ＋ CLAUDE.md コマンドあり ＋ 既存テスト green ＋ **土台が使える**）→ 「準備不要」と報告し `/power`（または `/power1-scope`）へ案内して**終了**。
  - **コンテナ外で、`.devcontainer` が無い／土台の設定が無い・スキル側と違う** → **Stage 1**（step2〜3。既存の `.devcontainer` は補完だけ）。
  - **コンテナ内で、土台の設定が無い・スキル側と違う** → step3 の「土台」だけを行ってコミットし、「**コマンドパレット → Dev Containers: Rebuild Container** → 起動後に `/power0-onboard` を再実行」と案内して終了する（土台はイメージに入るので再ビルドが要る）。
  - **コンテナ内で、土台の設定はあるのに使えない**（gh 未ログイン・gh-stack 無し）→ 「WSL のターミナルで `gh auth login` → このコンテナのターミナルで `bash /usr/local/share/power-base/setup.sh`」と案内する（**再ビルド不要**。コンテナは WSL の `~/.config/gh` をそのまま使う）。直ったら次の分岐へ。
  - **上記以外で未仕上げ**（コンテナ内で土台が使える、またはビルド可能）→ **Stage 2**（step4〜6）。

## step2 (Stage 1): スタック検出
- 並列 Explore / Grep で検出する: 言語・ランタイム(version)・パッケージマネージャ・build/test/typecheck/lint/起動コマンド・既存 CI（`.github/workflows` 等）・既存テストの有無。
  - 手掛かり: `package.json` / `pyproject.toml` / `go.mod` / `Gemfile` / `pom.xml` / `Cargo.toml` / `Makefile` / lockfile / CI yaml / README。
- 検出結果を**信頼性レベル付き**で提示。曖昧・不明（例: ランタイムのバージョン）は AskUserQuestion で確認。

## step3 (Stage 1): DevContainer 生成 ＋ CLAUDE.md 初版 → ハンドオフ
- 検出スタックに合う `.devcontainer/devcontainer.json`（必要なら `Dockerfile`）を生成する。**AI が考えて書くのは「そのシステム用」の部分だけ**:
  - ランタイムの**バージョンを固定**、`postCreateCommand` で依存導入、必要な system ライブラリを含める。
  - **OS はできるだけ保守中のものを選ぶ**（ランタイムが古くても）: 保守の切れた OS のイメージでは、apt で入れられない物が出る。Debian 11 は土台が元のリリースの版から入れ直すので問題ないが、Debian 10 以前は配布元に取得先が無く、sqlite3 が入らない（power4 はタスク DB を作らずに進み、ダッシュボードにも何も出ない）。古いランタイムが要るときは、保守中の OS のイメージ（`mcr.microsoft.com/devcontainers/base:bookworm` など）に、そのランタイムを feature で入れる（Node なら `ghcr.io/devcontainers/features/node:1` の `version` に古い版を指定。これはプロジェクト自身の Node なので node feature でよい。ダッシュボードのために足すのとは別の話）。
  - 既存 `.devcontainer` があれば**尊重・補完**（安易に上書きしない。下の土台が無ければ足すだけ）。
- **（必須）power の土台を入れる**: `devcontainer.json` に次の2つを足し、下のブロックで土台のフォルダをコピーする。
  1. `features` に `"./power-base": {}`（devcontainer.json の場所によって書き方が変わる。下の表）
  2. `"initializeCommand": ["mkdir", "-p", "${localEnv:HOME}/.config/gh"]` — ホストに `~/.config/gh` が無い（gh に一度もログインしていない）と、マウントできずに**コンテナそのものが起動しない**ため、起動前にホスト側で作っておく。これで gh にログインしていない人（power を使わないチームメンバー等）もコンテナは使え、起動ログに警告が出るだけになる。既に `initializeCommand` があれば object 形式にまとめる: `{"project": <既存の値>, "power-base": ["mkdir", "-p", "${localEnv:HOME}/.config/gh"]}`（並列に動くが互いに独立）。

  repo に `.claude/skills/` が無ければ、スキル一式もこのブロックで入れる（オーケストレーター `power` 経由なら step1-0 で済んでいるが、`/power0-onboard` を単体実行したときはまだ入っていない）:
  ```bash
  # スクリプトは「このスキルの置き場所」から辿る（作業ディレクトリや $HOME を基準にしない）
  B='<このスキルのベースディレクトリ>'   # Claude Code が「Base directory for this skill」で示す値をそのまま入れる
  B="$(printf '%s' "$B" | tr '\134' '/')"                    # \ を / に揃える（\134 はバックスラッシュ）
  if command -v wslpath >/dev/null 2>&1; then                # WSL の bash のときだけ変換する
    case "$B" in
      //wsl.localhost/*/*|//wsl[$]/*/*) B="/${B#//*/*/}" ;;   # \\wsl.localhost\<distro>\x → /x
      [A-Za-z]:/*) B="$(wslpath -u "$B")" ;;                  # C:\x → /mnt/c/x
    esac
  fi
  # 土台: 毎回スキル側の中身で置き換える（手を加えないファイルなので、違いの有無は判定しない）
  mkdir -p .devcontainer && rm -rf .devcontainer/power-base && cp -r "$B/templates/power-base" .devcontainer/
  # スキル一式: repo に無いときだけ入れる（取得できなくても止めない。終了コード 1 は「入れた」で、エラーではない）
  [ -d .claude/skills ] || bash "$B/../skills-update/scripts/refresh-skills-from-template.sh"
  ```
  - **土台で入るもの**（どのリポジトリでも同じ。詳しくは `templates/power-base/install.sh` の冒頭）:

    | 入るもの | 入れ方 |
    |---|---|
    | Claude Code（ネイティブ版） | ビルド時。Node を使わないので、Node の無いイメージでも入り、プロジェクトの Node にも触れない |
    | GitHub CLI | `dependsOn` で `github-cli` feature（devcontainer.json に別途書かなくてよい。書いてあっても害は無い） |
    | ホスト（WSL）の gh のログインの共有 | `~/.config/gh` をマウントし `GH_CONFIG_DIR` で指す。**コンテナのユーザー名（`node`・`vscode` 等）に左右されない** |
    | `gh auth setup-git`・git の名前（無いときだけ）・gh-stack | コンテナ起動のたびに `setup.sh`（何度動いても同じ。失敗しても起動は止めない） |
    | sqlite3 | ビルド時（power4 のタスク DB 用） |

  - **`.devcontainer/power-base/` には手を加えない**（直すときはスキル側を直す。power0 は実行のたびにスキル側の中身で置き換える）。
  - **Claude Code に公式の `claude-code` feature を使わない**: Node の無い apt 系イメージ（Python・Go・Java 等）では、あの feature は `nodejs` だけを入れて npm を入れられず、**ビルドごと失敗する**（1.0.5 で確認）。既存の devcontainer に入っている場合は消さなくてよい（土台は既にある Claude Code を使い、二重には入れない）。
  - **`~/.claude` はマウントしない**: 同じ名前のスキルが PC とリポジトリの両方にあると PC 側が使われ（Claude Code の仕様 "personal over project"）、repo 側を最新にしても効かなくなる。power スキルは repo 直下の `.claude/skills/` から読ませる（ワークスペースのマウントでコンテナにも入る。プロジェクトの `CLAUDE.md` も同じ）。
  - **スキル一式の投入は、相対パス（`.claude/skills/...`）では原理的に見つからない**（repo にスキルが無いときに使う手順なので）。スクリプトは必ず power0 自身の置き場所から辿る。`$HOME/.claude` も使わない——Stage 1 はコンテナ外（WSL）で動くので、`$HOME` は Windows 側とは別の空のディレクトリを指す。ユーザーのスキル置き場にもスキルが無い環境では実行できないので、その場合だけ `power/README.md` の手動 bootstrap を案内する。
  - 土台のフォルダは**必ず `.devcontainer/power-base/` に置く**（devcontainer CLI はローカル feature を `.devcontainer/` の下でしか受け付けない）。`features` に書くパスは devcontainer.json の場所からの相対パスなので、構成によって変わる:

    | devcontainer.json の場所 | `features` に足す1行 |
    |---|---|
    | `.devcontainer/devcontainer.json`（ふつう） | `"./power-base": {}` |
    | リポジトリ直下の `.devcontainer.json` | `"./.devcontainer/power-base": {}` |
    | `.devcontainer/<名前>/devcontainer.json`（複数構成） | `"../power-base": {}`（使う構成すべてに足す） |
- **（任意）タスクダッシュボードの配備**: `data/tasks.db` の状況をブラウザで見たい場合。AskUserQuestion で要否を確認（既定＝入れる）。入れる場合:
  - テンプレートリポジトリ（**`template.conf` の `TEMPLATE_REPO`**。リポジトリ直下の `.claude/skills/template.conf`、無ければこのスキルのベースディレクトリの1つ上にあるもの。`$HOME/.claude` では探さない——Windows の Claude Code から WSL を呼ぶと別ディレクトリを指すため。個人名・組織名を決め打ちしない）の `.beam/dashboard/`（Node 24 + better-sqlite3 の自己完結アプリ。`SOURCE_DB_PATH` 既定 `../../data/tasks.db` を**読取専用**参照。NOTION_* 無しなら **view モード**で Notion 不要）を **対象 repo の `.beam/dashboard/` にコピー**する。
  - **ダッシュボード専用の Node を入れる**: このスキルの `templates/beam-dashboard/` を、手を加えずに `.devcontainer/beam-dashboard/` へコピーし（毎回スキル側の中身で置き換える）、`features` に `"./beam-dashboard": {}` を足す（devcontainer.json の場所による書き方は、上の power-base の表と同じ）:
    ```bash
    # スクリプトは「このスキルの置き場所」から辿る（作業ディレクトリや $HOME を基準にしない）
    B='<このスキルのベースディレクトリ>'   # Claude Code が「Base directory for this skill」で示す値をそのまま入れる
    B="$(printf '%s' "$B" | tr '\134' '/')"                    # \ を / に揃える（\134 はバックスラッシュ）
    if command -v wslpath >/dev/null 2>&1; then                # WSL の bash のときだけ変換する
      case "$B" in
        //wsl.localhost/*/*|//wsl[$]/*/*) B="/${B#//*/*/}" ;;   # \\wsl.localhost\<distro>\x → /x
        [A-Za-z]:/*) B="$(wslpath -u "$B")" ;;                  # C:\x → /mnt/c/x
      esac
    fi
    mkdir -p .devcontainer && rm -rf .devcontainer/beam-dashboard && cp -r "$B/templates/beam-dashboard" .devcontainer/
    ```
    - **ダッシュボードのために公式の node feature（`ghcr.io/devcontainers/features/node`）を足してはいけない**: PATH の先頭に入るので、プロジェクト自身の Node（レガシーなら 16 や 18 など）まで置き換わり、ビルド・テスト・characterization テストの結果が変わってしまう。`beam-dashboard` は Node 24 をプロジェクトとは別の場所に入れて PATH には足さないので、**プロジェクトの Node は変わらない**（Node を使わないプロジェクトには Node が見えないまま）。
    - ダッシュボードは **`beam-dashboard` コマンドで起動する**（専用の Node で `.beam/dashboard/run.sh` を動かす）。`bash .beam/dashboard/run.sh` を直接実行すると、プロジェクトの Node（または Node 無し）で動いてしまう。
  - devcontainer.json に `"forwardPorts": [3939]` ＋ `portsAttributes` の `3939` に `"onAutoForward": "openPreview"` を追加する。
  - **`.beam/`（＋ `node_modules`/`dist`/`data`）を `.git/info/exclude` に追加**する（これは**あなたのツールであり repo 本体・PR に混ぜない**。特に **OSS 貢献（fork）では PR を汚さないため必須**）。
  - power4 が `data/tasks.db` を作るまでは**空一覧**で起動する（正常）。power の tasks.db は **beam4 互換スキーマ**なのでそのまま表示される。
- `templates/claude-md-template.md` を埋めて `CLAUDE.md` 初版を作成（コマンドは暫定。Stage 2 で確定）。
- **セキュリティガードレールの配置**: `docs/rule/ai-security-guardrails.md` が無ければ作成する（コピー元の解決順: リポジトリ直下 `.claude/skills/code-review/references/ai-security-guardrails.md` → `~/.claude/skills/code-review/references/…`）。beam5/power5・tdd/direct-implement が **P0 の参照先**とするファイルで、レガシー repo には無いため必須。
- **Git コミット（Stage 1 の成果）**: git 管理下なら、生成した `.devcontainer/`・`CLAUDE.md`・`docs/rule/` をデフォルトブランチにコミットする（`git commit -m "power0: onboard stage1"`）。`.beam/` は `.git/info/exclude` 済みなので入らない。**作業ツリーを clean にしてから次へ**（power1 の pull・分岐を妨げないため）。
- **（必須）ホスト（WSL）の gh のログインを確かめる**: `gh api user --jq .login` が通るか。通らなければ「WSL のターミナルで `gh auth login`」を案内し、済んでからハンドオフする（コンテナはこのログインを共有する。未ログインでもコンテナは起動するが、power4 以降の PR 作成が止まる）。
- **★明示ハンドオフ（ジュニア向け）**: 「**VS Code で『Reopen in Container』を実行 → コンテナ起動後に `/power0-onboard` を再実行**してください」と手順を具体的に案内し、**ここで一旦終了**する（再開可能）。
  - 理由も一言添える（コンテナ外では依存導入・ビルド疎通ができないため）。
  - 起動ログに `[power-base] 準備完了` と出れば土台は整っている。`⚠️` が出たら、その行の指示に従えばよい（再ビルドが要るかどうかも書いてある）。

## step4 (Stage 2): 依存導入・ビルド・実行・既存テスト
- 依存導入 → build → typecheck/lint → 既存テスト実行。失敗は原因を調べ**反復修正**する（古い依存・欠落設定・ネイティブビルド等）。**green を目標**。
- 起動コマンドで**実際にアプリが立ち上がる**ことを確認する（可能なら）。
- **（ダッシュボードを配備した場合）** `beam-dashboard` で起動確認（動き続けるコマンドなのでバックグラウンドで起動する。未ビルドなら自己ビルド＝数分。`curl -sf http://127.0.0.1:3939/health` が通り、view モードで `http://localhost:3939/` に空一覧が出れば OK）。ビルドに失敗したら `.beam/dashboard/node_modules` と `.beam/dashboard/dist` を消してから `beam-dashboard` をやり直す（専用の Node で入れ直される。`pnpm rebuild` を直接打つとプロジェクトの Node で作り直されてしまうので使わない）。
- どうしても解決できない失敗は**正直に報告**し、人間向けの具体的な手順・原因を残す（握りつぶさない）。

## step5 (Stage 2): 挙動ベースライン ＝ characterization テスト（半自動・回帰ネット）
- 主要な**エントリポイント / 挙動**の候補を列挙する（HTTP エンドポイント / CLI コマンド / 主要な公開関数・モジュール）。
- **AskUserQuestion で「どの挙動を pin するか」を確認**する（既定候補を提示。主要ハッピーパスを推奨）。
- 選ばれた対象に **golden-master / characterization テスト**を生成する: 現行コードに代表入力を与え、**出力を記録して固定**するテスト。テストランナーが無ければ最小構成を用意する。
- **明示する**: これは**現行挙動（バグ含む）を固定**するもので**網羅ではない**（回帰ネット）。**power6 の回帰ガードがこれを使う**。

## step6 (Stage 2): CLAUDE.md 確定
- 確定した build/test/typecheck/lint/起動/characterization 実行コマンド・スタック・（判明した範囲の）規約を `CLAUDE.md` に確定する（`templates/claude-md-template.md` の形式）。
- characterization テストの場所・実行方法も記載する。
- **Git コミット（Stage 2 の成果）**: git 管理下なら、characterization テスト・確定した `CLAUDE.md`・依存 lockfile 等をコミットする（`git commit -m "power0: onboard stage2"`）。**power1 が分岐する前に作業ツリーを clean に保つ**。

## step7: 完了報告
- 準備状態サマリー: ビルド/テスト green・起動可否・characterization {N} 件・CLAUDE.md コマンド確定・`.devcontainer` 有無・**土台（gh のログイン名・gh-stack・sqlite3・Claude Code）**。
- **未解決（人間対応）項目**を一覧で示す。
- 次工程の案内: **`/power`（機能追加）** または **`/power1-scope`**。
  - **リファクタリング目的なら**: power1 の「要件」に **「外部挙動を変えない」不変条件**を明記し、**power6 の回帰ガード ＋ 本 step5 の characterization テスト**で挙動不変を守る、と一言添える。

---

## 環境前提
- クローン済みリポジトリ内で実行する（クローンはユーザーの事前準備。**クローン / fork / private コピーの具体手順は `power/README.md` の「事前準備」を参照**）。WSL の bash 推奨。
- Stage 1 はコンテナ外（WSL ホスト）、Stage 2 はコンテナ内で実行される想定。
- **WSL で gh にログイン済みであること**（コンテナはそのログインを共有する。未ログインなら Stage 1 の最後に案内する）。

## テンプレートファイル
- `templates/claude-md-template.md` — 生成する `CLAUDE.md` の雛形（コマンド表中心）。**step3 / step6 で使用**。
- `templates/power-base/` — DevContainer の土台（ローカル feature。`devcontainer-feature.json`・`install.sh`・`setup.sh`）。**手を加えずに** `.devcontainer/power-base/` へコピーする。**step3 で使用**（step1 の判定でも中身を比べる）。
- `templates/beam-dashboard/` — タスクダッシュボード専用の Node と起動コマンド `beam-dashboard`（ローカル feature。`devcontainer-feature.json`・`install.sh`）。ダッシュボードを入れるときだけ、**手を加えずに** `.devcontainer/beam-dashboard/` へコピーする。**step3 で使用**（step1 の判定でも中身を比べる）。
