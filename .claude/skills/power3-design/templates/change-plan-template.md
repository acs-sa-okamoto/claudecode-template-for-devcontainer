# 変更計画（Change Plan）出力テンプレート

`power3-design` が `docs/spec/{機能名}/design/change-plan.md` を生成する際の書式。機能追加で **「どのファイルをどう触るか」** を一覧化し、INT（統合点）・FR と紐付ける。後続の `power4-tasks` がこれを基にタスクを切る。

各項目に信頼性レベル 🔵🟡🔴 を付す。

---

## 出力テンプレート

````markdown
# 変更計画（Change Plan）

**機能名:** [kebab-case-name]
**作成日:** YYYY-MM-DD
**入力:** feature-requirements.md / understanding-brief.md / docs/code-map.md

## 1. 変更サマリー

[この機能で何を追加/変更するかを2〜3文。新規追加と既存改修の比率感]

## 2. 触るファイル一覧

| 区分 | パス | 内容 | 関連 INT/FR | 信頼性 |
|---|---|---|---|---|
| 新規 | `src/.../export.ts` | CSV 生成ロジック | FR-01 | 🔵 |
| 改修 | `src/web/taskList.tsx` | エクスポートボタン追加 | INT-01 / FR-01 | 🔵 |

> understanding-brief で確定した INT（統合点）を必ずカバーする。改修ファイルは「既存のどの部分をどう変えるか」を一言添える。

## 3. 既存契約の拡張・変更

[既存の型/API/スキーマを拡張する場合の差分。**後方互換性**の注記。無ければ「なし」]

## 4. データ/スキーマ変更

[マイグレーションの有無・内容。無ければ「変更なし」]

## 5. 既存規約の踏襲方針

[understanding-brief で確認した規約（命名・構造・エラー処理・テスト）に、この変更がどう従うか]
````
