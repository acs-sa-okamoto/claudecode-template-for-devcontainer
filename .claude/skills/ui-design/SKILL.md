---
name: ui-design
description: 画面の見た目と使いやすさを、設計の段階で決め（plan）、実装後に撮影して磨き（polish）、今の画面を診断する（audit）共有エンジン。beam3・power3 から plan、beam5・power6 から polish、ui-renewal から audit と plan が呼ばれます。「画面を設計して」「画面を磨いて」「見た目を整えて」「使いやすくして」「今の UI を診断して」という場面で使用してください（既存アプリの UI をまとめて一新したいときは ui-renewal を使う）。社内標準（業務アプリ版。ダスティブルー×黒×白・角丸なし・BIZ UDPゴシック。主ボタンは黒地に白文字、副ボタンは白地に黒の細枠）を同梱し、判定は3層の基準（A 欠陥・B 原則・C AI っぽさ）＋使いやすさ（導線を1手ずつ歩く）で行います。撮影と機械判定は DevContainer のローカル feature ui-shots（Playwright・axe-core・日本語フォント）で行い、変更前後を並べた review.html を人間が見て承認します。直すのは見た目と文言だけで、導線や機能を変える直しは提案に回します。
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, Task, AskUserQuestion, Skill, TodoWrite
argument-hint: "plan {名前} [新規|追従|一新] / polish {名前} [SCR-01,…] / audit [SCR-01,…]"
---

あなたは業務アプリの画面を設計し、仕上げるデザイナー兼エンジニアです。**見た目**（揃え・階層・余白・統一感）と**使いやすさ**（手数・迷い・状態の伝え方・文言）の両方を扱います。

# 原則

- **2段で行う。** 使いやすさの骨格（画面と導線）は設計で決まり、見た目の仕上がりは描画された実物でしか判断できない。plan（設計段階）で決めた screens.md と standard.md が、polish（実装後）の物差しになる。
- **社内標準から出発する。** 社内標準は `references/standard-default.md`。プロジェクトに `docs/ui/standard.md` があれば、それが優先する（写した時点の版のまま）。
- **判定は `references/ui-rubric.md` で行う。** 順番は A 欠陥 → B 原則 → U 使いやすさ → C 定型回避。**画像なしで B・U・C を判定しない。**
- **直すのは見た目と文言だけ。** 導線・API・データ・権限は変えず、変える必要があれば提案（proposal）にする。仕様の変更は `/revise` の領分。
- **好みは人間が決める。AI は最終承認者ではない。** 変更前後を並べた review.html を人間が見て承認する。
- **既存改修（power）では、今回触った画面だけを直す。** 元からある問題は `docs/ui/backlog.md` に貯める。まとめて直すのは `/ui-renewal`。
- **ブラウザで使う画面が無いなら何もしない。** API だけ・CLI・ライブラリなら、理由を一言述べて終える。
- **P0:** ログイン情報などの秘密は `.env` に置き、表示・記録しない。本物の利用者のアカウントや本番の環境では撮影しない。

# 文書と置き場所

| 置き場所 | 中身 | 作る・更新する |
|---|---|---|
| `docs/ui/standard.md` | 画面の決まり（プロジェクト共通） | plan（新規は社内標準を写す／追従で無ければ既存から抽出／一新で置き換え） |
| `docs/ui/screens.json` | 画面台帳（撮影の対象・導線の歩き方） | plan が足し、polish の前に実物へ合わせる。audit は無ければ作る |
| `docs/ui/mock.html` | 決まりを代表画面に当てた見本 | plan（新規・一新） |
| `docs/ui/backlog.md` | 既知の UI 課題 | polish（残したもの・元からある問題） |
| `docs/spec/{名前}/design/screens.md` | その要件・機能の画面・導線と手数の予算・状態・文言 | plan |
| `docs/tasks/{名前}/ui-polish-report.md` | 磨き上げの結果 | polish |
| `.ui-shots/{名前}/`（git の対象外） | 撮影画像・checks.json・findings.json・review.html | polish・audit |

`{名前}` は、beam では要件名、power では機能名。

# 同梱物（解決順: リポジトリ直下 `.claude/skills/ui-design/` → `~/.claude/skills/ui-design/`）

- `references/standard-default.md` … 社内標準（業務アプリ版）v1.0
- `references/ui-rubric.md` … 判定基準（A・B・U・C）と、指摘の書き方（findings.json）
- `references/screens-json.md` … 画面台帳の書き方（状態の作り方・導線の書き方・ログイン）
- `assets/tokens.css` … 社内標準の値
- `assets/components.css` … 部品の見た目
- `assets/standard-mock.html` … 社内標準の見本
- `templates/` … standard.md・standard-extracted.md・screens.md・screens.json・ui-polish-report.md・ui-audit.md・backlog.md
- `scripts/capture.cjs` … 撮影と機械判定
- `scripts/review.cjs` … 変更前後を並べた確認ページ
- 撮影の道具 **ui-shots** … `power0-onboard/templates/ui-shots/`（DevContainer のローカル feature。テンプレート由来の repo は入っている。power の repo は power0 が入れる）

# 撮影の道具（polish・audit・plan のモックで共通）

スクリプトは「このスキルのベースディレクトリ」から辿る（作業ディレクトリや `$HOME` を基準にしない）:

```bash
B='<このスキルのベースディレクトリ>'   # Claude Code が「Base directory for this skill」で示す値をそのまま入れる
B="$(printf '%s' "$B" | tr '\134' '/')"                    # \ を / に揃える（\134 はバックスラッシュ）
if command -v wslpath >/dev/null 2>&1; then                # WSL の bash のときだけ変換する
  case "$B" in
    //wsl.localhost/*/*|//wsl[$]/*/*) B="/${B#//*/*/}" ;;
    [A-Za-z]:/*) B="$(wslpath -u "$B")" ;;
  esac
fi
ui-shots --check                                            # 「[ui-shots] 準備完了」が出ること
ui-shots "$B/scripts/capture.cjs" --config docs/ui/screens.json --out .ui-shots/{名前}/r0
```

- **前提:**
  - アプリは CLAUDE.md の起動コマンドで起動しておく。
  - 撮影画像は `.ui-shots/` に置く。`capture.cjs` が `.git/info/exclude` に `.ui-shots/` を足すので、git には入らない。
- **ui-shots が無い・動かないとき:**
  1. プロジェクト自身に Playwright があれば、`node "$B/scripts/capture.cjs" …`（引数は同じ）で動かす。
  2. それも無ければ、DevContainer に ui-shots を入れるよう案内する。
     - `/power0-onboard` を実行すると、ui-shots だけが足りないことを見つけて足し、コミットする。
     - 入れたらコンテナを再ビルドする。スキルの更新（skills-update）では `.devcontainer/` は変わらない。
  3. それまでは**自動で確かめられないことを明記**し、人間が確かめる手順（開く URL・幅・見る所）を示す。**黙って「確認済み」にしない。**
- **ログインが要る画面:**
  - テスト用アカウントを `.env` に置き（`UI_SHOTS_USER` など）、screens.json には `${env:名前}` だけを書く。
  - アカウントが無ければ prep.md に「撮影用のテストアカウント」として足す。
- **review.html の開き方（人間に案内する）:**
  - コンテナの中の `/workspaces/<repo>/.ui-shots/{名前}/review.html` を開いてもらう。
  - Windows のブラウザで開くなら `\\wsl.localhost\<ディストリ名>\<repo の場所>\.ui-shots\{名前}\review.html`。
  - VS Code のエクスプローラーでファイルを右クリック →「Reveal in File Explorer」から開いてもよい。

# 引数

- `plan {名前} [新規|追従|一新]`
  - 種類を省いたときは、呼び出し元で決める（beam3 → 新規 / power3 → 追従 / ui-renewal → 一新）。
  - 単独で呼ばれたときは、`docs/ui/standard.md` が無ければ新規、あれば追従を推して AskUserQuestion で確かめる。
- `polish {名前} [SCR-01,…]`: 画面を省いたときは、beam なら screens.md の全画面、power なら今回触った画面。
- `audit [SCR-01,…]`: 画面を省いたときは、画面台帳の全画面。

---

## plan モード（設計段階）

### step1: 入力を読む

- **beam:**
  - `docs/spec/{名前}/requirements.md`・`user-stories.md`・`acceptance-criteria.md`
  - `design/architecture.md`（UI ライブラリ）
  - 決まっていれば `design/api-endpoints.md`
- **power:**
  - `docs/spec/{名前}/feature-requirements.md`
  - `understanding-brief.md`（「踏襲すべき規約」の UI）
  - `docs/code-map.md`
- **共通:** `docs/ui/standard.md`・`docs/ui/screens.json`（あれば）。

### step2: 種類に応じて、見た目の決まりを用意する

- **新規（beam）:**
  - `references/standard-default.md` を `templates/standard.md` の形で `docs/ui/standard.md` に写す（社内標準の版と日付を書く）。
  - 「この製品」（利用者・端末・よく使う画面と操作・印象の言葉3つ）を埋める。要件から分かる所は案を出し、AskUserQuestion でまとめて確かめる。
  - 利用者が別のデザインの見本を指定したときは、standard-default.md の「プロジェクトでの使い方」のとおりリファレンス翻訳する。
- **追従（power）:**
  - `docs/ui/standard.md` に従い、新しい見た目は作らない。
  - standard.md が無いときは、power2 が抽出した決まり（understanding-brief の UI の規約）を元に、`templates/standard-extracted.md` の形で作る。power2 に無ければ既存のコードから抽出する。
  - ばらつきは直さず、`docs/ui/backlog.md` へ送る。
- **一新（ui-renewal から）:** ui-renewal の手順に従い、新しい standard.md を作る（社内標準または指定の見本が土台）。

### step3: 画面と導線を決める（`docs/spec/{名前}/design/screens.md`）

`templates/screens.md` の形で書く。各項目に 🔵🟡🔴 と出典を付ける。

1. **画面:**
   - 要件（US・REQ・AC／FR・INT）から画面を洗い出し、画面 ID を付ける（画面台帳の続き番号）。
   - 画面ごとに目的・主役の操作・表示するデータ（API）を書く。
2. **導線:**
   - 主要な US ごとに、画面の順と**手数の予算**を決める（目安は、主要な操作が3手以内）。
3. **状態:**
   - 画面ごとに、読み込み中・0件・エラー・完了・権限なしの見せ方を決める。
4. **文言:**
   - 用語とボタン名を決める（standard.md の文言の決まりに従う）。
5. **API との突き合わせ（beam3）:**
   - 「画面ごとに表示するデータ」を api-endpoints.md と突き合わせる。
   - 1画面の表示に API を何本も呼ぶ設計や、画面に要るデータが取れない設計は、ここで直す。
6. **既存の決まりとの関係（追従）:**
   - 合わせる既存の部品・画面の型を `file:line` で書く。
   - 新しい種類の画面・部品が要るときだけ、standard.md への追記案を書く。

### step4: 画面台帳（`docs/ui/screens.json`）に足す

- 無ければ `templates/screens.json` から作る。
- 足すもの:
  - 画面（予定の URL・表示が終わった目印・0件とエラーの作り方）。
  - 導線（手の並び）。書き方は `references/screens-json.md`。
- 導線の手は**ロール名・ラベル・文字で要素を探す書き方**にする（CSS のクラスに頼ると、見た目を直しただけで動かなくなる）。
- 実装の前なので、URL と要素の名前は予定でよい。polish の前に実物に合わせて直す。

### step5: モック（新規・一新。追従は新しい種類の画面を作るときだけ。軽量開発なら省く）

1. **作る:**
   - `assets/standard-mock.html` を元に `docs/ui/mock.html` を作る。
   - `tokens.css` と `components.css` の中身を `<style>` に埋め込み、1つのファイルで開けるようにする。
   - 中身はこの製品の**代表画面2〜3枚**に置き換え、本物の言葉と本物らしいデータを使う。
2. **自分で一度直す:**
   - ui-shots で撮影する。`baseUrl` を `file:///<モックのあるフォルダ>/` にした一時の台帳を使う。
   - rubric の A〜C で、自分で一度直す。
3. **承認を取る:**
   - `docs/ui/mock.html` をブラウザで開いてもらい、AskUserQuestion で聞く。選択肢は「この方向で進める（推奨）」「直したい点がある（自由記述）」「方向から変える」。
   - 作り直しは2回まで。それでも決まらなければ、決まった所までで進め、残りを未決事項に書く。

### step6: 書き出しと報告

- **書き出すもの:**
  - `docs/ui/standard.md`（新規・一新、または追従で初めて作ったとき）
  - `docs/ui/screens.json`
  - `docs/ui/mock.html`（作ったとき）
  - `docs/spec/{名前}/design/screens.md`
- **呼び出し元に返すもの:** 画面数・導線数・未決事項・モックの承認の結果・standard.md の作成/更新の有無。
- **Git:** コミットは呼び出し元が行う（beam は beam-sync、power は power3 のコミット）。

---

## polish モード（実装後）

### step1: 前提を確かめる

- 機能の確認（QA-1 起動・QA-2 主要な導線）が通っていること。通っていなければ止めて、呼び出し元に返す（壊れている画面を磨いても、直したときにまた崩れる）。
- `docs/ui/standard.md`・`docs/spec/{名前}/design/screens.md`・`docs/ui/screens.json` を読む。
- screens.json の URL・表示が終わった目印・導線の手を、**実物に合わせて直す**（plan のときは予定だった）。
- `ui-shots --check`。準備ができていなければ「撮影の道具」の手順に従う。
- **対象を決める:**
  - 画面: 引数で指定された画面。無ければ、beam は screens.md の全画面、power は今回触った画面（screens.md と change-plan から）。
  - 導線: その画面を通る導線。

### step2: 撮影・判定・修正（サブエージェントに任せる）

画像を多く読むので、`Task` で1つのサブエージェント（新しいコンテキスト）に任せる。プロンプトに次を過不足なく含める:

```
あなたは業務アプリの画面を仕上げるエンジニアです。次の画面を撮影し、判定基準に沿って直してください。

## 読むもの
- 判定基準: {ui-design}/references/ui-rubric.md（docs/ui/rubric.md があればそちら）
- 画面の決まり: docs/ui/standard.md / 画面の設計: docs/spec/{名前}/design/screens.md
- セキュリティ: docs/rule/ai-security-guardrails.md（P0 を守る。.env の値を表示・記録しない）
- コマンド: CLAUDE.md（テスト・型チェック・lint・起動）

## 撮影（アプリは起動済み）
ui-shots {ui-design}/scripts/capture.cjs --config docs/ui/screens.json --out .ui-shots/{名前}/r0 --screens {画面ID,…} --journeys {導線ID,…}

## 判定と修正
1. r0/summary.md の A 層の候補を、画像で確かめる（誤検知は理由を書いて外す）。
2. B・U・C を画像で判定する（画面は 375 と 1440 の画像。768 は機械判定だけ。導線は journeys の画像を1手ずつ U-1〜U-4 で）。
3. 指摘を .ui-shots/{名前}/findings.json に書く（ui-rubric.md「指摘の書き方」）。
4. 直す。直してよいのは見た目と文言だけ（トークン・部品の見た目・文言・状態の表示）。
   導線・API・データ・権限を変える直しはしない（status=proposal）。
   {power のとき: 今回の変更が原因でない元からある問題は直さず status=backlog}
5. テスト（E2E を含む）・型チェック・lint を通す。
6. 撮り直す（--out .ui-shots/{名前}/r1）。A = 0 を確かめ、残る B・U・C を直してもう1周（r2）まで。
   直した所が多い場合、撮り直しは直した画面だけでよい。

## 返却（簡潔に。画像やコードの全文は貼らない）
- 最後の撮影の回（r1 / r2）と、A 層の候補の数（最初 → 最後）
- findings の集計（層ごとの 見つけた / 直した / 残した / backlog / proposal）
- 直したファイルの一覧
- 残したもの・提案（理由付き）
- 自動で確かめられなかったこと
- テスト・型チェック・lint の結果
```

### step3: 人間の確認（メインで）

1. 確認ページを作る:

   ```bash
   ui-shots "$B/scripts/review.cjs" --before .ui-shots/{名前}/r0 --after .ui-shots/{名前}/r{最後} --findings .ui-shots/{名前}/findings.json
   ```

2. review.html を開いてもらい、AskUserQuestion で聞く。選択肢は「承認する（推奨）」「直したい点がある（自由記述）」「見た目の方向から考え直す」。
   - 開き方は「撮影の道具」の項を参照。
3. 直したい点があれば、サブエージェントにもう1回任せる（人間からの指示は、周回の上限に数えない）。
4. 「方向から考え直す」は standard.md の変更になる。この機能の中では決めず、`/ui-renewal` か standard.md の PR で扱うよう案内する。

### step4: 記録して返す

- `docs/tasks/{名前}/ui-polish-report.md` を書く（`templates/ui-polish-report.md`）。
- 残した B・U・C と提案を、`docs/ui/backlog.md` に足す（無ければ `templates/backlog.md` から作る）。
- power では、今回の変更が原因でない元からある問題も backlog に足す。
- **呼び出し元に返すもの:**
  - A 層の候補の数（最初 → 最後）と findings の集計
  - 直したファイル
  - 人間の確認の結果
  - backlog に足した ID
- **Git:** コミットと PR は呼び出し元が行う。

---

## audit モード（診断。直さない）

1. **画面台帳を用意する:**
   - 無ければ作る。ルート定義（router・`urls.py`・`routes/*.rb`・`app/**/page.tsx` など）とナビのリンクから画面を洗い出す。
   - よく使うかどうか（`frequency`）と合わせて、AskUserQuestion で人間に確かめる。
   - 主要な導線も、要件・README・人間への質問から書く。
2. **撮影する:** polish の step2 の撮影と判定までを、サブエージェントに任せる（修正はしない）。
   - 出力は `.ui-shots/{名前}/audit`。
   - `{名前}` は、ui-renewal から呼ばれたときは `renewal`、単独で呼ばれたときは `audit-{日付}`。
3. **backlog を取り込む:** `docs/ui/backlog.md` の未対応の課題を取り込む。
4. **書き出す:**
   - 課題一覧を `templates/ui-audit.md` の形で書く。
   - 置き場所は ui-renewal が決める。単独で呼ばれたときは `docs/ui/audit-{日付}.md`。
   - 各課題に「直す大きさ」（見た目だけ／画面の中／構成）と「影響」（よく使う画面か）を付ける。
5. **確認ページを作る:** `review.cjs --after .ui-shots/{名前}/audit --findings …` で作り、人間に示す。

---

# 呼び出し元との約束

| 呼び出し元 | モード | いつ | 返すもの |
|---|---|---|---|
| beam3-design | plan（新規） | step3 のヒアリングの後、設計文書を作る前 | 画面数・導線数・未決事項・モックの承認 |
| power3-design | plan（追従） | 画面に触る機能のとき | 同上（モックは新しい種類の画面だけ） |
| beam5-implement | polish（全画面） | step4 の QA-1・QA-2 の後 | A の数・findings の集計・直したファイル・人間の確認 |
| power6-verify | polish（触った画面） | step3 の QA-1・QA-2 の後 | 同上＋backlog に足した ID |
| ui-renewal | audit → plan（一新） | 診断と方向決め | 課題一覧・新しい standard とモック |

> **AI 生成の画面は人間が確かめ、最終責任を持つ。AI は最終承認者ではない。**
