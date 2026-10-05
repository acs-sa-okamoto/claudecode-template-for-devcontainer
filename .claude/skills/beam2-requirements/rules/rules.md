# rules

## ファイル名のルール

### 出力ファイルのパス形式（階層構造）

- `docs/spec/{要件名}/requirements.md`
- `docs/spec/{要件名}/interview-record.md`
- `docs/spec/{要件名}/user-stories.md` （フル機能開発のみ、または「詳細なユーザーストーリー」カスタム選択時）
- `docs/spec/{要件名}/acceptance-criteria.md` （フル機能開発のみ、または該当カスタム選択時）
- `docs/spec/{要件名}/note.md` （beam1-tasknote が生成。本スキルはこれを入力として読み込む）
- `docs/spec/{要件名}/prep.md` （ユーザー準備タスクがある場合のみ）

### 要件名の命名規則

- 要件名を簡潔な英語に変換する
- ケバブケース（kebab-case）を使用
- 最大50文字程度に収める
- 例:
  - "ユーザー認証システム" → "user-auth-system"
  - "データエクスポート機能" → "data-export"
  - "パスワードリセット" → "password-reset"

## ID 番号のレンジ規則

要件・テストケース等のIDは、種類ごとに番号レンジを分けて採番する。種類追加時に他のIDと衝突しないようにする。

### 機能要件（REQ）

| ID 範囲 | カテゴリ | EARS パターン |
|---|---|---|
| REQ-001 〜 REQ-099 | 通常要件 | `システムは {動作} しなければならない` |
| REQ-101 〜 REQ-199 | 条件付き要件 | `{条件} の場合、システムは {動作} しなければならない` |
| REQ-201 〜 REQ-299 | 状態要件 | `{状態} にある場合、システムは {動作} しなければならない` |
| REQ-301 〜 REQ-399 | オプション要件 | `システムは {オプション機能} してもよい` |
| REQ-401 〜 REQ-499 | 制約要件 | `システムは {制約事項} しなければならない` |

### 非機能要件（NFR）

| ID 範囲 | カテゴリ |
|---|---|
| NFR-001 〜 NFR-099 | パフォーマンス |
| NFR-101 〜 NFR-199 | セキュリティ |
| NFR-201 〜 NFR-299 | ユーザビリティ |
| NFR-301 〜 NFR-399 | 可用性・信頼性 |
| NFR-401 〜 NFR-499 | 保守性・拡張性 |

### エッジケース（EDGE）

| ID 範囲 | カテゴリ |
|---|---|
| EDGE-001 〜 EDGE-099 | エラー処理 |
| EDGE-101 〜 EDGE-199 | 境界値 |
| EDGE-201 〜 EDGE-299 | 並行性・タイミング |

### テストケース（TC）

- 形式: `TC-{要件ID}-{連番}` または `TC-{要件ID}-{種別}{連番}`
- 種別:
  - 正常系: 連番のみ（例: `TC-001-01`, `TC-001-02`）
  - 異常系: `E` プレフィックス（例: `TC-001-E01`）
  - 境界値: `B` プレフィックス（例: `TC-001-B01`）

## 品質判定基準

```
✅ 高品質:
- 要件の曖昧さ: なし
- 入出力定義: 完全
- 制約条件: 明確
- 実装可能性: 確実
- 信頼性レベル: 🔵（青信号）が80%以上

⚠️ 要改善:
- 要件に曖昧な部分がある
- 入出力の詳細が不明確
- 技術的制約が不明
- ユーザー意図の確認が必要
- 信頼性レベル: 🟡🔴（黄・赤信号）が20%以上
```

## TODO更新パターン

```
- 要件定義フェーズを「completed」にマーク
- 次のフェーズ「設計文書作成（beam3-design）」をTODOに追加
- 品質判定結果をTODO内容に記録
```

## 信頼性レベル指示

各項目について、**情報源との照合状況**を以下の信号でコメントする：

| 信号 | 意味 |
|---|---|
| 🔵 **青信号** | 情報源（PRD・タスクノート・既存設計文書・ユーザヒアリング応答）に明示的な記載があり、ほぼ推測していない |
| 🟡 **黄信号** | 情報源から妥当な推測ができる場合（明示的記載は無いが、文脈から導ける） |
| 🔴 **赤信号** | 情報源に無い推測（実装側の判断・一般的なベストプラクティスの適用など） |

**情報源の定義**:
- PRD (`docs/spec/{要件名}/product-requirements.md`)
- タスクノート (`docs/spec/{要件名}/note.md`)
- **既存の**設計文書 (`docs/design/*.md` など、本スキル実行**前**から存在するもの)
- 本スキル実行中の AskUserQuestion による応答
- CLAUDE.md / README.md などのプロジェクトメタ情報

**注意**: 本スキルが**今まさに作成中**の `requirements.md` 自身は情報源に含めない（自己参照を避けるため）。

## ファイルパスの記載ルール

- **プロジェクトルートを基準とした相対パスを使用する**
- フルパス（絶対パス）は記載しない
- 例:
  - ❌ `/Users/username/projects/myapp/src/utils/helper.ts`
  - ✅ `src/utils/helper.ts`

## 作業規模別の出力調整

### フル機能開発

- すべてのセクションを含む
- 詳細なユーザーストーリー作成
- 包括的な受け入れ基準作成
- 非機能要件・エッジケースを網羅

### 軽量開発

- 機能要件の主要項目のみ（3-5項目）
- ユーザーストーリーは requirements.md 内に簡易記載
- 受け入れ基準は基本項目のみ
- 非機能要件は最低限

### カスタム

- step2 で選択された項目のみ含める
- 必要に応じてファイルを分割

# info

## AskUserQuestion ツールの使用例

すべてのヒアリングは AskUserQuestion ツールを使用して行います。以下は具体的な使用例です。

### 既存設計確認系質問

```
AskUserQuestion({
  questions: [{
    question: "現在のCLAUDE.mdで定義されている{具体的な制約事項}について、実際の運用で問題ないでしょうか？",
    header: "制約確認",
    multiSelect: false,
    options: [
      { label: "問題ない", description: "現在の制約事項で運用可能" },
      { label: "変更が必要", description: "制約の見直しが必要" }
    ]
  }]
})
```

### 詳細化系質問（複数選択）

```
AskUserQuestion({
  questions: [{
    question: "この機能で必要な操作を選択してください",
    header: "必要な操作",
    multiSelect: true,
    options: [
      { label: "データの追加", description: "新しいデータを追加する機能" },
      { label: "データの編集", description: "既存データを編集する機能" },
      { label: "データの削除", description: "データを削除する機能" },
      { label: "データの検索", description: "データを検索する機能" }
    ]
  }]
})
```

### 追加要件系質問

```
AskUserQuestion({
  questions: [{
    question: "レポート・分析機能は必要ですか？",
    header: "レポート機能",
    multiSelect: false,
    options: [
      { label: "必要", description: "レポート・分析機能を実装する" },
      { label: "不要", description: "レポート機能は不要" }
    ]
  }]
})
```

### 優先順位確認（複数質問）

```
AskUserQuestion({
  questions: [
    {
      question: "以下の要件の中で、Must Have（必須）の項目を選択してください",
      header: "Must Have",
      multiSelect: true,
      options: [
        { label: "ユーザー認証", description: "ログイン・ログアウト機能" },
        { label: "データ管理", description: "CRUD操作" },
        { label: "レポート機能", description: "データの集計・出力" }
      ]
    },
    {
      question: "リリーススコープについて教えてください",
      header: "リリース計画",
      multiSelect: false,
      options: [
        { label: "一括リリース", description: "すべての機能を同時にリリース" },
        { label: "段階的リリース", description: "フェーズごとに段階的にリリース" }
      ]
    }
  ]
})
```

### 影響確認系質問

```
AskUserQuestion({
  questions: [{
    question: "この新機能により、既存の{機能名}の変更は許容できますか？",
    header: "影響許容度",
    multiSelect: false,
    options: [
      { label: "許容できる", description: "既存機能の変更を許容" },
      { label: "最小限にしてほしい", description: "既存機能への影響を最小限に" },
      { label: "変更不可", description: "既存機能は変更しない" }
    ]
  }]
})
```

### 注意事項

- **header** は12文字以内の短いラベル
- **question** は明確で具体的な質問文
- **options** は2-4個の選択肢
- **multiSelect** は複数選択可能にする場合 true
- ユーザーは常に「その他」を選択して自由記述できる（自動付与される）
