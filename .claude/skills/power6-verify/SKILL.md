---
name: power6-verify
description: 機能追加の最終検証とPR化を行うスキル（power ワークフローの工程6・最終）。own モードはスタック最上段、upstream モードは feature ブランチで build/test/lint＋実環境動作＋回帰検証（既存を壊していない）＋要件適合（conformance-report）を行い、/code-review を回して CRITICAL/HIGH を修正（最大2ラウンド、残る LOW/MEDIUM は既知・許容としてレポート）。その後 own では beam-sync でスタック最上段 power6-{機能名} の PR を作り（upstream は機能コードだけのクリーン PR）、PR 差分に /code-review（再レビュー）→ code-map 最終更新まで行います。「検証」「power6」「機能を仕上げて」「PRを出して」という場面で使用してください。CI/lint/test は green 必須。最終承認は人間（AIは最終承認者ではない）。
allowed-tools: Read, Glob, Grep, Bash, Task, Write, Edit, AskUserQuestion, Skill, TodoWrite
argument-hint: "[機能名 / 空（docs/spec から自動検出）]"
---

あなたは機能追加の最終検証とリリース準備を行うエンジニアです。power5 までで実装された内容（own モードは `power5-phase*` のスタック、upstream モードは `feature/{機能名}`）に対し、**「動く・既存を壊していない・要件を満たす」を確かめ、レビューで仕上げ、PR を出す**最終工程です。

これは **power ワークフローの工程6（検証・最終）**。**ブラウンフィールド特有の回帰検証**（既存を壊していない）と、**PR ＋ 再レビュー**まで担います。

# 原則
- **「テスト全通過 ≠ 動く」**: テストだけで完了とせず、**実環境・実データ**で主要フローを動かす。
- **回帰ガード**: understanding-brief の **REG（壊してはいけない既存機能）を必ず確認**する。
- **レビューの終了条件は「CRITICAL/HIGH がゼロ」**（指摘ゼロではない）。`/code-review` は LLM 推論ベースで非決定的＋主観指摘が尽きないため、**ゼロまでループしない**。残る LOW/MEDIUM は「既知・許容（人間判断）」として残す。再レビューは**修正差分に絞る**。修正は**最大2ラウンド**。
- **AI は最終承認者ではない**: PR と最終状態を整え、マージは人間が判断する。

# context
- 機能名: `{機能名}`（引数 or 自動検出）、作業ブランチ: **own はスタック最上段 `power6-{機能名}`**（power5 の最終フェーズの上に作る）／**upstream は `feature/{機能名}`**、base: **トランク＝リポジトリの既定ブランチ**（決め打ちせず `gh repo view --json defaultBranchRef` で解決。取得できなければ `main`。以下 `$TRUNK`）
- ブランチ戦略はオーケストレーター `power` の「ブランチ戦略」節に従う（トランクベース・常設 develop なし・**1機能＝1マージ単位**。own はフェーズごとのスタックド PR を `gh stack merge` でアトミックに、upstream は機能コードだけの1本のクリーン PR）
- 入力: `docs/spec/{機能名}/feature-requirements.md`・`understanding-brief.md`（**REG**・規約）・`design/` / `docs/code-map.md` / `data/tasks.db`

---

## step1: 準備
- `{機能名}` を確定（引数。無ければ Glob、複数なら AskUserQuestion）。**own モードは最上位の実装フェーズブランチ**（open な PR を持つ最大の `power5-phase{N}-{機能名}`。無ければ `feature/{機能名}`）、**upstream モードは `feature/{機能名}`** 上にいることを確認（違えばチェックアウト）。ここで作る成果は 6-2 で `power6-{機能名}` に載る。
- 読込: feature-requirements（FR/NFR/AC）・understanding-brief（**REG**・規約）・design/・`docs/code-map.md`・`CLAUDE.md`・`docs/rule/ai-security-guardrails.md`。
- `CLAUDE.md` から build/test/typecheck/lint と起動コマンドを把握。

## step2: 統合チェック（決定的）
- build / 全 test / typecheck / lint を実行（CLAUDE.md のコマンド）。失敗は step5 のループで（または即時）修正する。**最終的に全 green が必須**。
- **整合ドリフトの確認（git 管理下・warn）**: 仕様・設計（`docs/spec/{機能名}/`）の最終コミットが下流成果物（`docs/tasks/{機能名}/`・`src/`・conformance-report）より新しい場合、「上流が改定されたのに下流が未追随」の疑いとして警告し、`/revise` での整合回復を提案する（ハードゲートにはしない）。

## step3: 実環境・回帰検証
- **実環境**: アプリを起動し、主要フローを**実データ**で動かす（空でない正しい応答／画面が出るか）。外部データソース（既存DB・API・ファイル）は**実物**で確認する。
  - **確認の中身は `beam5-implement/references/ui-performance-verification.md` の §2 に従う**（解決順: リポジトリ直下 `.claude/skills/` → `~/.claude/skills/`）——QA-1 スモーク → QA-2 主要ジャーニー（正常系＋異常系）→ QA-3 レスポンシブ（375/768/1440px）→ **QA-4 アクセシビリティ（WCAG AA・キーボード完走）** → QA-5 性能実測。**種別に応じて非該当は理由を一言述べてスキップ**（UI が無いなら QA-2〜4 は非該当）。
  - **既存改修ならではの注意**: 今回**触った画面・エンドポイントに絞って**実施する。全画面を毎回舐める必要はない（範囲は understanding-brief の INT/REG で決まる）。既存に元からある WCAG 違反・性能問題は、**今回の変更が原因でなければ「既知」として記録**し、この PR の修正対象にはしない（スコープ膨張を防ぐ）。
  - 実行手段は DevContainer 内の Playwright。使えない場合は**「自動検証できていない」と明記**し、手動確認の手順を示す。
- **回帰（★ブラウンフィールド）**: understanding-brief の **各 REG について「検証方法」を実行**し、既存機能が壊れていないことを確認する。壊れていれば修正対象。
- **回帰は累積**: 過去にマージ済みの機能の characterization/テストも合わせて green を維持する（今回の変更が**過去機能も壊していない**こと）。
- 不一致・不具合は、テストではなく**実物に合わせて実装/設計を修正**する。

## step4: 要件適合ゲート
- feature-requirements の **全 FR/NFR/AC** について判定し `docs/tasks/{機能名}/conformance-report.md` に出力する（beam と同じ形式: `要件ID | 判定 | 根拠`）:
  - ⭕ 満たす（根拠: テスト名 / `file:line` / 実機確認）/ ❌ 未達 / 🟢 タスク不要（理由必須）
  - **列挙を含む要件は項目単位**で判定（1項目でも欠ければ ❌）。
- ❌ が残れば修正（または AskUserQuestion で許容理由を確認）。

## step5: コードレビュー・ループ（`/code-review`）★終了条件 = CRITICAL/HIGH ゼロ

> **ここは「統合レビュー」であって初回レビューではない。** 各実装フェーズは power5 のフェーズ単位ゲートで既に CRITICAL/HIGH=0 まで通っている。ここで見るのは**フェーズをまたいで初めて見えるもの**——層をまたぐ契約の不整合、フェーズ間で重複した実装、全体として満たせていない NFR、既存コードとの結合面。**各フェーズ内部の指摘を再度洗い直さない**（同じ差分を二度レビューしてもノイズが増えるだけ）。
> ※ power5 のゲートを通していない場合（upstream モードで単発実行した等）は、ここが唯一のレビューになるので全体を対象にする。

**最大2ラウンド**で回す:
1. `Skill(skill="code-review", args="$TRUNK")` を実行する（**トランクから見た機能全体の差分**。own モードではコードが `power5-phase*` ブランチに分かれているため、`feature/{機能名}` を指定すると実装差分が入らない）。生成されたレビューレポートを読み、**CRITICAL/HIGH（反証されていないもの）**を抽出し、上記のとおり**統合面の指摘に絞る**。
2. CRITICAL/HIGH があれば**修正**する（直接 Edit、または集中サブエージェント Task に委譲）。build/test/lint を再実行して green を確認し、`git commit -m "power6: fix review findings (round N)"`。
   - **修正には再発防止テストを添える**: 直した不具合を検知するテストを1本書く。テスト名に対象を明示する（coding-principles の E-1〜E-4 に該当するなら `E-1 リグレッション: …` のように ID を含める）。カバレッジ率のためではなく、**同じ盲点の再発を機械的に止めるため**。既存改修では、このテストがそのまま次回以降の回帰ネット（REG）に加わる。
3. **修正差分に絞って再レビュー**（フルスキャンしない＝ノイズ・非決定性を抑える）。

> **★順序を入れ替えないこと（機械的検査が先）**: step1〜step4（build/test/lint・実環境動作・回帰・要件適合）を通してからこの step5 に入る。**AI が書いたコードを同じ AI がレビューすると両方に同じ盲点が入る**ため、レビューは機械的検査の**代わりにはならない**。テストが赤いままレビューへ進まない。この限界が具体的に出るのが coding-principles の **E-1〜E-4（AI が繰り返す機能バグ）**で、一見動くコードに見えるためレビューでは安定して捕まらない。
- **CRITICAL/HIGH が無くなれば終了**。2ラウンド消化しても残る場合は、その内容を明記して**人間にエスカレーション**する。
- **残る LOW/MEDIUM は「既知・許容（人間判断）」**としてまとめる（ブロッカーにしない。主観的指摘を追いかけない）。

## step6: Git ファイナライズ（PR ＋ 再レビュー）

### 6-1. PR モードの判定
- `gh repo view --json parent` で `origin` が fork か（`parent` があるか）を確認する:
  - **`parent` あり → 「本家（upstream）へ貢献」モード**（fork＝ケースA）
  - **`parent` なし → 「自分の repo で完結」モード**（private コピー＝ケースB）
- AskUserQuestion で確認する（検出結果を既定にする）。

### 6-2. 自分の repo モード（ケースB・★スタックの最上段を作る）

own モードでは、この機能はすでに **1本のスタック**になっている（power4 が `feature/{機能名}` を、power5 が各 `power5-phase{N}-{機能名}` を積んでいる）。power6 はその**最上段**として自分の層を作る:

```
$TRUNK
 └ feature/{機能名}           ← power1〜4（ドキュメント）
    └ power5-phase1-{機能名}  ← 実装 Phase 1（レビュー済み）
       └ power5-phase2-{機能名}
          └ power6-{機能名}   ← ここ（検証・要件適合・統合修正）
```

- `Skill(skill="beam-sync", args="{機能名} power6")` を実行する。conformance-report・回帰の記録・このステップで入れた修正・最終化した code-map が `power6-{機能名}` ブランチに載り、最上段の PR になる。base は自動で「open な PR を持つ最も高い実装フェーズ」に解決される。
- **PR 本文には検証結果を載せる**（beam-sync が power6 用の要約項目に従って生成する）: 要件適合（⭕/🟢/❌）、回帰結果（各 REG: 維持/影響）、実環境動作（QA-1〜5）、統合レビュー結果、code-map 根拠の再検証結果。
- **step5 の修正が下位フェーズのコードに及ぶ場合**: 原則は**この power6 層にまとめてコミットする**（下位ブランチへ差し戻して restack しない）。指摘はレイヤーをまたぐのが普通で、差し戻すと上位すべてのリベースが要る。ただし「Phase 2 の実装そのものが誤っている」など**そのフェーズの PR の主張が成り立たなくなる**場合だけは、当該フェーズブランチに戻して修正し、`gh stack sync` で追従する。
- power の生成物も含めて PR してよい（自分の repo なので）。

### 6-3. 本家 upstream モード（ケースA・★PR をクリーンに）
**PR には「機能コードの差分」だけを入れ、power の process 生成物は混ぜない**（レビュアーのノイズ・マージ阻害を防ぐ）。

除外する process 生成物: `.beam/`（既に `.git/info/exclude`）・**`.claude/`（あなたのスキル・設定＝repo に同梱していても本家 PR には入れない）**・`.devcontainer/`・`CLAUDE.md`・`docs/spec/{機能名}/`・`docs/tasks/{機能名}/`・**`docs/implements/`（tdd/direct の実装記録）**・**`docs/revisions/`（revise の改定記録）**・`docs/code-map.md`・`docs/reviews/`・`data/tasks.db`。**characterization テストも既定で除外**（ローカルの安全網。CLAUDE.md の「挙動ベースライン」に記載されたパスを `:(exclude)` に加える。リファクタで挙動不変を示したい場合のみ含める）。

手順（work ブランチ `feature/{機能名}` は全履歴付きでローカルに残し、別に**クリーン PR ブランチ**を作る）:
```bash
git fetch upstream
# 本家（upstream）の既定ブランチを解決する（origin と異なる場合があるため決め打ちしない）
git remote set-head upstream -a >/dev/null 2>&1 || true
UP="$(git symbolic-ref --short refs/remotes/upstream/HEAD 2>/dev/null | sed 's|^upstream/||')"
[ -n "$UP" ] || UP=main

git checkout -b "pr/{機能名}" "upstream/$UP"
# feature の差分のうち process 生成物を除いたものだけを取り込む（追加/変更/削除に対応）
git diff "upstream/$UP..feature/{機能名}" -- . \
  ':(exclude).beam' ':(exclude).claude' ':(exclude).devcontainer' ':(exclude)CLAUDE.md' \
  ':(exclude)docs/spec/{機能名}' ':(exclude)docs/tasks/{機能名}' \
  ':(exclude)docs/implements' ':(exclude)docs/revisions' \
  ':(exclude)docs/code-map.md' ':(exclude)docs/reviews' ':(exclude)data/tasks.db' \
  | git apply --index
# ★コミット前に必ず `git diff --cached` を確認し、機能コードだけであることを検証する
git commit -m "<機能の説明>"
git push -u origin "pr/{機能名}"
gh pr create --base "$UP" --head "pr/{機能名}"   # fork からは既定で upstream 宛
```
- process 生成物（要件・設計・タスク・code-map・conformance/review レポート）は PR に含めず、必要なら **PR 本文に要約・リンク**として添える。

### 6-4. PR 差分に最終レビュー（＝指定の「再レビュー」）
- 作成された PR に `Skill(skill="code-review", args="<PR番号>")` を実行。**レポートはコミットせず** PR 本文に要約／リンクする。own モードでは**最上段（`power6-{機能名}`）の PR** を対象にする（下段のフェーズ PR は power5 のゲートで各々レビュー済み）。
- PR 本文に: 機能概要（feature-requirements）／要件適合サマリー（⭕/❌/🟢）／回帰結果／レビュー結果（CRITICAL/HIGH=0・既知の LOW/MEDIUM）／test・lint=green。

### 6-5. 未マージ機能の上に積んだ場合（先行機能へのスタック接続）

power1 の②で **基点が別の機能のブランチ（未マージの先行機能）** になっていた場合だけ追加で気にする。トランク基点なら、この機能自身のスタックは beam-sync が既に組んでいるので何もしなくてよい。

- 先行機能のスタックの**上に**この機能のスタックを載せる形になる。`gh stack link --base "$TRUNK" <先行機能の各ブランチ…> feature/{機能名} power5-phase1-{機能名} …` のように、**先行機能のブランチ群を前に並べて**1本のスタックとして登録する（`gh stack link` は追加のみで冪等なので、フルのリストを渡してよい）。
- 目的は**マージ順の強制**。基点の PR を先にマージしないと、こちらの変更はトランクへ届かない。
- 拡張が無い環境（`gh stack` 不可）では**手でスタックを模倣しない**。「先行機能の PR を先にマージすること」を報告に明記して人間に委ねる。

### 6-6. マージ方針（報告に含める）

- **1機能＝1マージ単位。** own モードではスタック全体を `gh stack merge` で **all-or-nothing** に落とす。部分的に分割してマージしないこと（トランクが「機能が半分だけ入った状態」を経由し、リリース可能性が崩れる）。

  ```bash
  gh stack view                      # どこまで積まれているか確認
  gh stack merge --merge --yes       # スタック全体をアトミックにマージ
  ```

- **`feature/{機能名}`（power1-4 層）を単独でマージしない。** ドキュメントのみなのでトランクは壊れないが、**あそこはレビュー地点であってマージ地点ではない**。先に落とすと「要件だけ入って実装が無い」状態がトランクを通過し、1マージ単位の性質が失われる。
- **マージ方法**: 既定は**マージコミット**（フェーズ単位の足跡を残すため）。upstream のクリーン PR モードは元から1コミットなので差が出ない。
- ⚠️ **base に merge queue がある場合、マージ方法はキューが決める**（`--merge` / `--squash` / `--rebase` / `--merge-method` は**警告付きで無視される**）。その環境では上記の既定は保証されないため、**キュー側の設定に合わせる**。
- **マージ後**: ブランチ削除・base の張り替えは GitHub 側が行うので人手で管理しない。次の機能は**最新化したトランクから**分岐する（power1 の①）。

### 6-7. 前提未達
- `gh` 未認証・非 git の場合は push/PR をスキップし、**手動手順を案内**（検証自体は完了として報告）。

## step7: code-map 最終更新と完了報告
- `docs/code-map.md` を最終化する。**今回の変更で図（構成／主要フロー／データの流れ）と索引が実態とずれていないかを確認し、ずれていれば直す**。
- **根拠の再検証（必須）**: 実装でコードが動いたぶん、power2 時点の `path:line` は**ずれている前提**で扱う。
  ```bash
  # 1) code-map 冒頭の「検証リビジョン」を現在の HEAD（40桁 SHA）に更新してから
  # 2) 根拠が実コードに存在するか機械検証する
  # スクリプトは「このスキルの置き場所」から辿る（作業ディレクトリや $HOME を基準にしない）
  B='<このスキルのベースディレクトリ>'   # Claude Code が「Base directory for this skill」で示す値をそのまま入れる
  B="$(printf '%s' "$B" | tr '\134' '/')"                    # \ を / に揃える（\134 はバックスラッシュ）
  if command -v wslpath >/dev/null 2>&1; then                # WSL の bash のときだけ変換する
    case "$B" in
      //wsl.localhost/*/*|//wsl[$]/*/*) B="/${B#//*/*/}" ;;   # \\wsl.localhost\<distro>\x → /x
      [A-Za-z]:/*) B="$(wslpath -u "$B")" ;;                  # C:\x → /mnt/c/x
    esac
  fi
  bash "$B/../power2-understand/scripts/verify-code-map-evidence.sh"
  ```
  - **パスはこのスキルの置き場所から辿る。** ここは長い工程の最後で、直前にビルドやテストのために `cd` していることが多い。相対パス（`.claude/skills/...`）だと、コンテナの中でもそこで外れる。
  - **スクリプトが見つからない・実行できない（終了コード 127 など）ときは、①で更新した検証リビジョンを元に戻し、「未検証」と明記する。** 再検証できていないのにリビジョンだけ新しくすると、古い根拠が新しいコミットで検証済みであるかのように 🔵 を名乗り続ける。
  - 失敗した根拠は**必ず直す**（行ずれ・移動・削除）。直せないものは根拠を外し、その項目を **🟡 に格下げ**する。
  - 出力の「検証した根拠: N 件」が、書いた根拠の数と一致していることを確認する（少なければ記法が外れて黙って検証対象から漏れている）。
  - **古い検証リビジョンのまま残さない**。放置すると「昔は正しかった根拠」が 🔵 を名乗り続け、code-map 全体が信用できなくなる。
  - 記法・作図規律は `power2-understand/references/code-map-diagrams.md` を参照。
- 必要なら `git commit -m "power6: update code-map"`。
- 完了報告:
  - build/test/lint（green）、実環境動作の結果、**回帰結果（各 REG: 維持/影響）**
  - 要件適合（⭕ {n} / ❌ {n} / 🟢 {n}、`conformance-report.md` へのリンク）
  - レビュー結果（修正ラウンド数、**CRITICAL/HIGH = 0**、**既知の LOW/MEDIUM 一覧**）
  - **code-map の根拠検証（検証した根拠 N 件 / 失敗 0 件 / 検証リビジョン更新済み）**
  - **PR の URL**
- power ワークフロー（power1〜6）の完了を宣言する。

> **AI 生成コードは人間がレビューし、最終責任を持つ。AI は最終承認者ではない。** PR のマージは人間が判断する。

---

## 環境前提
- own モードは**スタック最上段**（`power6-{機能名}`）、upstream モードは `feature/{機能名}` 上で実行。WSL の bash 推奨。`gh` 認証済みなら PR 作成まで自動、無ければ push/PR は手動案内。
- **`gh-stack` 拡張（`gh extension install github/gh-stack`）は own モードの必須依存**。power4 / power5 / power6 がフェーズごとのスタックド PR を積むため、無いと PR 化ができない（`beam-sync` が step1 で中断し、手動スタック運用へはフォールバックしない）。通常は DevContainer の post-create で導入済み。upstream モードはスタックを使わないので不要。
- `/code-review`（差分レビュー）と実装エンジンを Skill で再利用する。conformance 形式は beam と同じ（要件ID → 判定 → 根拠）。
