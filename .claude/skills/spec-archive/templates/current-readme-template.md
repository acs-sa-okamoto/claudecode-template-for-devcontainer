# 現役の仕様（入口）

<!--
docs/spec/current/README.md。現役の仕様の入口。AI も人も最初にここを読み、必要な領域のファイルだけを開く。
- 完了した機能の要件は、spec-archive がここへまとめる。作業中の機能の要件は、まだ docs/spec/{機能名}/feature-requirements.md にある（差分）
- 今の構造（どこに何のコードがあるか）は地図帳 docs/code-atlas/ が持つ。ここは「何をするか・何をしないか」だけ
-->

**最終更新:** {YYYY-MM-DD}（{まとめた機能}）

## このシステムについて

- **目的:** {誰の何を解決するか。1〜3 文。最初の PRD・要件から}
- **利用者:** {主な利用者}
- **主な利用の流れ:** {1〜3 行}

## 領域

| 領域 | ファイル | 扱うこと | 主な ID |
|---|---|---|---|
| {領域名} | [{英名}.md]({英名}.md) | {1 行} | {例: REQ-001〜020（my-app）・FR-01〜12（sound-feedback）} |

- **文面の正本**（画面に出す文章そのもの。コードがここを正本として参照する）: [texts/](texts/)

## ID の書き方

- 元の ID のまま変えず、出典の名前を全角かっこで添える: `REQ-017（my-app）`・`FR-11（app-guide-onboarding）`
- コードやテストのコメントにある `FR-11` などは、元の機能の ID を指す。どの機能のものかは、この README の「領域」の表か、`grep -rn "FR-11（" docs/spec/current/` で引く
- 廃止した要件は取り消し線で残す（ID を再利用しない）

## 作業中の機能（まだここにまとめていない）

<!-- spec-archive が更新する。作業中の機能の要件は、このほかに docs/spec/{機能名}/feature-requirements.md を読む -->

- {機能名}: [feature-requirements.md](../{機能名}/feature-requirements.md)

## 確かめること（まとめる途中で判断できなかったもの）

<!-- 🔴 にした項目と、その理由。人が確かめたら消す。無ければ「なし」 -->

- {ID（出典）}: {何が分からないか}

## 関連

- 片付けの記録（元の文書の取り出し方・まとめなかった ID）: [ARCHIVE.md](../ARCHIVE.md)
- 改定記録: [docs/revisions/](../../revisions/)
- 運用の知識（環境変数・外部サービスの設定）: [docs/operations.md](../../operations.md)
- 地図帳（今の構造）: [docs/code-atlas/index.md](../../code-atlas/index.md)
