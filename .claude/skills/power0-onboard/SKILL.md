---
name: power0-onboard
description: 既存・レガシーリポジトリを power ワークフロー（および人間）が安全に作業できる状態に整える準備スキル（power 工程0）。「power0」「レガシーを準備」「既存システムを power 用に整える」「DevContainer を作って動かせるように」「リポジトリの準備」という場面で使用してください。クローン済みリポジトリ（cwd）に対し、①スタック検出→DevContainer 生成、②依存導入・ビルド・既存テスト green 化・実行確認、③挙動ベースライン（characterization/golden-master テスト＝回帰ネット）を半自動で用意、④CLAUDE.md（コマンド表）を確定、を行います。DevContainer 生成の都合で「コンテナ外 Stage1 → Reopen in Container → コンテナ内 Stage2」の2ステージ・再開可能。ドキュメント（全体像の地図）は書きません（それは power2 が code-map 化）。自動で解決できない所は人間向けに明示案内します（ジュニアが詰まらないように）。
allowed-tools: Read, Glob, Grep, Bash, Task, Write, Edit, AskUserQuestion, Skill, TodoWrite
argument-hint: "[空（cwd のリポジトリを準備）]"
---

あなたは既存・レガシーリポジトリの**オンボーディング（作業環境の立ち上げ）**を行うエンジニアです。**power1 以降（および人間）が安全に作業できる状態**——**動く・テストできる・コマンドが分かる・挙動のベースラインがある**——を作ります。

これは **power ワークフローの工程0（準備）**。**リポジトリのクローンは事前にユーザーが済ませてある前提**（cwd = 対象リポジトリ）。

# 原則
- **ドキュメント（全体像の地図）は書かない**。ここでやるのは「**動かせる・測れる・コマンドが分かる**」状態づくり。地図化（全体像＋索引）は後続の **power2** が担う。
- **2ステージ・再開可能**: DevContainer は「設定生成（コンテナ外）→ Reopen in Container → 依存/ビルド/テスト（コンテナ内）」の順でしか作れない。**ステージは自動判定して再開**する。
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
- 分岐:
  - **既に準備済み**（コンテナ内 or ビルド可 ＋ CLAUDE.md コマンドあり ＋ 既存テスト green）→ 「準備不要」と報告し `/power`（または `/power1-scope`）へ案内して**終了**。
  - **未整備・コンテナ外**（`.devcontainer` 無し等）→ **Stage 1**（step2〜3）。
  - **コンテナ内 or ビルド可能だが未仕上げ**→ **Stage 2**（step4〜6）。

## step2 (Stage 1): スタック検出
- 並列 Explore / Grep で検出する: 言語・ランタイム(version)・パッケージマネージャ・build/test/typecheck/lint/起動コマンド・既存 CI（`.github/workflows` 等）・既存テストの有無。
  - 手掛かり: `package.json` / `pyproject.toml` / `go.mod` / `Gemfile` / `pom.xml` / `Cargo.toml` / `Makefile` / lockfile / CI yaml / README。
- 検出結果を**信頼性レベル付き**で提示。曖昧・不明（例: ランタイムのバージョン）は AskUserQuestion で確認。

## step3 (Stage 1): DevContainer 生成 ＋ CLAUDE.md 初版 → ハンドオフ
- 検出スタックに合う `.devcontainer/devcontainer.json`（必要なら `Dockerfile`）を生成する:
  - ランタイムの**バージョンを固定**、`postCreateCommand` で依存導入、必要な system ライブラリを含める。
  - **（必須）コンテナ内で Claude Code が使えるようにする**: `features` に `ghcr.io/anthropics/devcontainer-features/claude-code:1.0` を含める（**`~/.claude` マウントは使わない**）。
    - **power スキルは repo 同梱で供給する**: Claude Code は repo 直下の `.claude/skills/` を**プロジェクトスキル**として読み、ワークスペース mount でコンテナにも入る。プロジェクトの `CLAUDE.md` もワークスペース mount で自動的にコンテナ内にある。
    - **repo に `.claude/skills/` が無い場合は、この場で入れる**（オーケストレーター `power` 経由なら step1-0 で済んでいるが、`/power0-onboard` を単体実行したときはまだ入っていない）:
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
      bash "$B/../skills-update/scripts/refresh-skills-from-template.sh"
      ```
      テンプレートの最新で**無条件に上書き**する（有無・鮮度を判定しない）。取得できなくても止めない（fail-open）。
      - **この手順はリポジトリにスキルが無いときに使うものなので、相対パス（`.claude/skills/...`）では原理的に見つからない。** スクリプトは必ず power0 自身の置き場所から辿る。`$HOME/.claude` も使わない——Stage 1 はコンテナ外（WSL）で動くので、`$HOME` は Windows 側とは別の空のディレクトリを指す。
      - ユーザーのスキル置き場にもスキルが無い環境では実行できないので、その場合だけ `power/README.md` の手動 bootstrap を案内する。
  - 既存 `.devcontainer` があれば**尊重・補完**（安易に上書きしない。上記の feature / mount が無ければ追記する）。
- **（任意）タスクダッシュボードの配備**: `data/tasks.db` の状況をブラウザで見たい場合。AskUserQuestion で要否を確認（既定＝入れる）。入れる場合:
  - テンプレートリポジトリ（**`template.conf` の `TEMPLATE_REPO`**。リポジトリ直下の `.claude/skills/template.conf`、無ければこのスキルのベースディレクトリの1つ上にあるもの。`$HOME/.claude` では探さない——Windows の Claude Code から WSL を呼ぶと別ディレクトリを指すため。個人名・組織名を決め打ちしない）の `.beam/dashboard/`（Node22 + better-sqlite3 の自己完結アプリ。`SOURCE_DB_PATH` 既定 `../../data/tasks.db` を**読取専用**参照。NOTION_* 無しなら **view モード**で Notion 不要）を **対象 repo の `.beam/dashboard/` にコピー**する。
  - 生成 devcontainer に (a) `ghcr.io/devcontainers/features/node:1`（version `22`。**プロジェクトのスタックが Node でなくても** feature は共存できるので dashboard 用に併載）(b) `"forwardPorts": [3939]` ＋ `portsAttributes` の `3939` に `"onAutoForward": "openPreview"` を追加する。
  - **`.beam/`（＋ `node_modules`/`dist`/`data`）を `.git/info/exclude` に追加**する（これは**あなたのツールであり repo 本体・PR に混ぜない**。特に **OSS 貢献（fork）では PR を汚さないため必須**）。
  - power4 が `data/tasks.db` を作るまでは**空一覧**で起動する（正常）。power の tasks.db は **beam4 互換スキーマ**なのでそのまま表示される。
- `templates/claude-md-template.md` を埋めて `CLAUDE.md` 初版を作成（コマンドは暫定。Stage 2 で確定）。
- **セキュリティガードレールの配置**: `docs/rule/ai-security-guardrails.md` が無ければ作成する（コピー元の解決順: リポジトリ直下 `.claude/skills/code-review/references/ai-security-guardrails.md` → `~/.claude/skills/code-review/references/…`）。beam5/power5・tdd/direct-implement が **P0 の参照先**とするファイルで、レガシー repo には無いため必須。
- **Git コミット（Stage 1 の成果）**: git 管理下なら、生成した `.devcontainer/`・`CLAUDE.md`・`docs/rule/` をデフォルトブランチにコミットする（`git commit -m "power0: onboard stage1"`）。`.beam/` は `.git/info/exclude` 済みなので入らない。**作業ツリーを clean にしてから次へ**（power1 の pull・分岐を妨げないため）。
- **★明示ハンドオフ（ジュニア向け）**: 「**VS Code で『Reopen in Container』を実行 → コンテナ起動後に `/power0-onboard` を再実行**してください」と手順を具体的に案内し、**ここで一旦終了**する（再開可能）。
  - 理由も一言添える（コンテナ外では依存導入・ビルド疎通ができないため）。

## step4 (Stage 2): 依存導入・ビルド・実行・既存テスト
- 依存導入 → build → typecheck/lint → 既存テスト実行。失敗は原因を調べ**反復修正**する（古い依存・欠落設定・ネイティブビルド等）。**green を目標**。
- 起動コマンドで**実際にアプリが立ち上がる**ことを確認する（可能なら）。
- **（ダッシュボードを配備した場合）** `bash .beam/dashboard/run.sh` で起動確認（未ビルドなら自己ビルド＝数分。view モードで `http://localhost:3939/` に空一覧が出れば OK。`better-sqlite3` は Node22 でネイティブビルドされる。失敗時は `pnpm rebuild better-sqlite3`）。
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
- 準備状態サマリー: ビルド/テスト green・起動可否・characterization {N} 件・CLAUDE.md コマンド確定・`.devcontainer` 有無。
- **未解決（人間対応）項目**を一覧で示す。
- 次工程の案内: **`/power`（機能追加）** または **`/power1-scope`**。
  - **リファクタリング目的なら**: power1 の「要件」に **「外部挙動を変えない」不変条件**を明記し、**power6 の回帰ガード ＋ 本 step5 の characterization テスト**で挙動不変を守る、と一言添える。

---

## 環境前提
- クローン済みリポジトリ内で実行する（クローンはユーザーの事前準備。**クローン / fork / private コピーの具体手順は `power/README.md` の「事前準備」を参照**）。WSL の bash 推奨。
- Stage 1 はコンテナ外（WSL ホスト）、Stage 2 はコンテナ内で実行される想定。

## テンプレートファイル
- `templates/claude-md-template.md` — 生成する `CLAUDE.md` の雛形（コマンド表中心）。**step3 / step6 で使用**。
