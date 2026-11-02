# 画面台帳（docs/ui/screens.json）の書き方

> `capture.cjs` が読む、撮影の対象の一覧。プロジェクトに1つ（`docs/ui/screens.json`）。
> plan が画面と導線を足し、polish の前に実物（URL・要素の名前）に合わせて直す。audit は無ければ作る。
> JSON なのでコメントは書けない。説明はここと screens.md に書く。

## 全体

```json
{
  "version": 1,
  "baseUrl": "http://localhost:3000",
  "tokens": "src/styles/tokens.css",
  "widths": [375, 768, 1440],
  "auth": { "steps": [ ... ] },
  "screens": [ ... ],
  "journeys": [ ... ]
}
```

| 項目 | 必須 | 中身 |
|---|---|---|
| `baseUrl` | ✅ | アプリの URL（コンテナの中から見た URL）。`--base-url` で上書きできる |
| `tokens` | — | トークンファイル（CSS 変数）。色と文字サイズの機械判定（A-9）に使う。無ければページの CSS 変数で判定し、それも無ければ飛ばす |
| `widths` | — | 撮影する幅。既定は 375・768・1440 |
| `auth` | — | ログインの手順。`login: true` の画面・導線があるときだけ、1回だけ行って使い回す |
| `screens` | ✅ | 画面（下記） |
| `journeys` | — | 導線（下記） |

## 画面（screens）

```json
{
  "id": "SCR-01", "name": "経費の申請一覧", "path": "/claims", "login": true,
  "waitFor": { "text": "経費の申請" },
  "frequency": "high",
  "states": {
    "empty": { "routes": [{ "url": "**/api/claims*", "json": [] }] },
    "error": { "routes": [{ "url": "**/api/claims*", "status": 500, "json": { "error": "internal" } }] },
    "long":  { "routes": [{ "url": "**/api/claims*", "transform": "long" }] }
  }
}
```

| 項目 | 中身 |
|---|---|
| `id` / `name` | 画面 ID（SCR-01…。screens.md と同じ）と名前 |
| `path` | `baseUrl` からの道筋。`#` 付きも可 |
| `login` | ログインが要るなら `true` |
| `waitFor` | 表示が終わった目印。`{"text": "…"}` / `{"selector": "…"}` / `{"url": "**/…"}` / `{"ms": 500}` |
| `frequency` | よく使う画面か（`high` / `mid` / `low`）。audit が課題の優先順位に使う |
| `widths` | この画面だけ幅を変えるとき |
| `fullPage` | `false` で画面に見えている範囲だけを撮る（ダイアログなど、画面に固定された物を見るとき）。既定は縦に全部（6000px まで） |
| `states` | `default`（いつもの表示）以外の状態。下記 |

### 状態（states）— API の応答を差し替えて作る

| 書き方 | 作る状態 |
|---|---|
| `{"url": "**/api/x*", "json": []}` | 0件 |
| `{"url": "**/api/x*", "status": 500, "json": {...}}` | エラー |
| `{"url": "**/api/x*", "transform": "long"}` | 長い文字列（本物の応答の、件名・名前・説明などの文字を長くする。キーは `keys` で指定できる） |
| `{"url": "**/api/x*", "abort": true}` | 通信の失敗 |

- 画面を作るのがサーバー側（API を呼ばずに HTML を返す）なら、状態はテスト用のデータで作る。作れない状態は、screens.md に「手動で確かめる」と書く。
- 状態の名前は自由。`empty`・`error`・`long` に、そろえておくと読みやすい。

## 導線（journeys）

```json
{
  "id": "J-01", "name": "経費を申請する", "story": "US-001", "budget": 3, "login": true,
  "widths": [1440, 375],
  "steps": [
    { "goto": "/claims", "shot": "一覧" },
    { "click": { "role": "link", "name": "経費を申請する" }, "shot": "入力" },
    { "fill": { "label": "件名", "value": "11月分の交通費" } },
    { "fill": { "label": "金額（円）", "value": "12480" } },
    { "click": { "role": "button", "name": "申請する" }, "shot": "申請後" },
    { "waitFor": { "text": "申請しました" } }
  ]
}
```

- **手の種類:** `goto` / `click` / `fill`（`value`）/ `select`（`option`）/ `check` / `uncheck` / `press`（キー名）/ `hover` / `waitFor`。
- **撮影:** どの手にも `"shot": "名前"` を付けられ、その手の後に撮る。
- **手数（hands）:** `click`・`select`・`check`・`uncheck`・`press` を1手と数える。`budget` を超えると「予算超え」になる（U-5）。
- **要素の探し方:** **ロール名・ラベル・文字で探す**（`{"role": "button", "name": "申請する"}`・`{"label": "件名"}`・`{"text": "…"}`）。
  - CSS のクラス（`selector`）は最後の手段にする。
  - クラスで探すと、見た目を直しただけで導線が動かなくなる。
  - ロール名とラベルで探せない要素は、それ自体がアクセシビリティの問題（A-6）。

## ログイン（auth）とテスト用のアカウント

```json
"auth": { "steps": [
  { "goto": "/login" },
  { "fill": { "label": "メールアドレス", "value": "${env:UI_SHOTS_USER}" } },
  { "fill": { "label": "パスワード", "value": "${env:UI_SHOTS_PASSWORD}" } },
  { "click": { "role": "button", "name": "ログイン" } },
  { "waitFor": { "url": "**/home" } }
] }
```

- **値の置き場所（P0）:**
  - 値は `${env:名前}` で書き、`.env`（git に入れない）か環境変数に置く。
  - `capture.cjs` は値を表示もファイル出力もしない。
- **アカウント:** 開発用のテストアカウントを使う。本物の利用者のアカウント・本番の環境は使わない。
- **無いとき:** アカウントが無ければ prep.md（人間の準備タスク）に「撮影用のテストアカウント」として書く。

## 撮影の実行

```bash
ui-shots <ui-design>/scripts/capture.cjs --config docs/ui/screens.json --out .ui-shots/<名前>/r0 \
  [--screens SCR-01,SCR-02] [--states default,empty] [--widths 375,1440] [--journeys J-01|none] [--no-axe]
```

- **出力:** `<out>/shots/*.png`・`<out>/journeys/*.png`・`<out>/checks.json`・`<out>/summary.md`。
- **git から外す:** `.ui-shots/` の下に書くと、`.git/info/exclude` に `.ui-shots/` を自動で足す（撮影画像は git に入れない）。
- **終了コード:** 0 = 撮影できた（指摘の有無は問わない）/ 1 = 開けなかった画面がある / 2 = 使い方・設定の誤り。
