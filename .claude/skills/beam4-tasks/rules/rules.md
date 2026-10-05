# rules

## ファイル名のルール

### 出力ファイルのパス形式（階層構造）

- `docs/tasks/{要件名}/overview.md`
- `docs/tasks/{要件名}/TASK-0001.md` （1ファイル1タスク）
- `docs/tasks/{要件名}/TASK-0002.md`
- （全タスク分）

### 要件名の命名規則

- 要件名を簡潔な英語に変換する
- ケバブケース（kebab-case）を使用
- 最大50文字程度に収める
- 例:
  - "ユーザー認証システム" → "user-auth-system"
  - "データエクスポート機能" → "data-export"
  - "パスワードリセット" → "password-reset"

## ID 番号のルール

| 対象 | 形式 | 発行元 |
|---|---|---|
| タスクID | `TASK-{4桁ゼロ埋め}`（例: TASK-0001） | **beam4-tasks が発行** |
| 機能要件 | `REQ-{3桁}`（例: REQ-001, REQ-101） | beam2-requirements が発行（参照のみ） |
| 非機能要件 | `NFR-{3桁}`（例: NFR-001, NFR-101） | beam2-requirements が発行（参照のみ） |
| エッジケース | `EDGE-{3桁}`（例: EDGE-001） | beam2-requirements が発行（参照のみ） |

- タスクID は既存の `docs/tasks/{要件名}/TASK-*.md` を確認し、重複しない連番を採番する
- 各タスクは関連する要件ID（REQ/NFR/EDGE）へリンクする

## 品質判定基準

```
✅ 高品質:
- タスク粒度: 適切（各タスク 13.0 ストーリーポイント以下、分割可能な単位）
- ストーリーポイント見積もり: 全タスクに算出済み（小数点第一位）
- 依存関係: 完全に定義
- 実装可能性: 確実
- 信頼性レベル: 🔵（青信号）が80%以上

⚠️ 要改善:
- タスクに曖昧な部分がある
- 依存関係が不明確
- 技術的制約が不明
- 実装手順の確認が必要
- 信頼性レベル: 🟡🔴（黄・赤信号）が20%以上
```

## TODO更新パターン

```
- タスク分割フェーズを「completed」にマーク
- 次のフェーズ「タスク実装（beam5-implement）」をTODOに追加
- 品質判定結果をTODO内容に記録
```

## 信頼性レベル指示

各項目について、**情報源との照合状況**を以下の信号でコメントする：

| 信号 | 意味 |
|---|---|
| 🔵 **青信号** | 情報源（PRD・タスクノート・要件定義書・設計文書・ユーザヒアリング応答・CLAUDE.md）に明示的な記載があり、ほぼ推測していない |
| 🟡 **黄信号** | 情報源から妥当な推測ができる場合（明示的記載は無いが、文脈から導ける） |
| 🔴 **赤信号** | 情報源に無い推測（実装側の判断・一般的なベストプラクティスの適用など） |

**情報源の定義**:
- PRD (`docs/spec/{要件名}/product-requirements.md`)
- タスクノート (`docs/spec/{要件名}/note.md`)
- 要件定義書 (`docs/spec/{要件名}/requirements.md`)
- 設計文書 (`docs/spec/{要件名}/design/*` — beam3-design の成果物)
- 本スキル実行中の AskUserQuestion による応答
- CLAUDE.md / README.md などのプロジェクトメタ情報

## ファイルパスの記載ルール

- **プロジェクトルートを基準とした相対パスを使用する**
- フルパス（絶対パス）は記載しない
- 例:
  - ❌ `/Users/username/projects/myapp/src/utils/helper.ts`
  - ✅ `src/utils/helper.ts`

- **タスクファイル内の相互リンク**は `docs/tasks/{要件名}/` 内の相対パスを使用:
  - 同じディレクトリ内: `[overview.md](overview.md)`, `[TASK-0002.md](TASK-0002.md)`
  - 要件定義書: `[requirements.md](../../spec/{要件名}/requirements.md)`
  - 設計文書: `[architecture.md](../../spec/{要件名}/design/architecture.md)`

## 作業規模別の出力調整

### フル機能開発（詳細タスク分割）

- すべてのセクションを含む
- 詳細な実装手順作成
- 包括的なテストケース作成
- UI/UX要件を網羅

### 軽量開発（軽量タスク分割）

- 基本的なタスク定義のみ
- 主要な実装手順のみ
- 基本的なテスト要件のみ
- UI/UX要件は最低限

### カスタム

- step2 で選択された項目のみ含める

## タスクプロセス定義（参考）

**注意**: 以下のスラッシュコマンド（`/tdd-*`, `/direct-*`）は **beam5-implement の内部処理として後日実装予定**。現時点では存在しないため、タスクファイルには「実装フェーズで使用する手順の参考」として記載する。実装は beam5-implement が担う。

### TDDタスク（参考手順）
1. `/tdd-requirements` - 詳細要件定義
2. `/tdd-testcases` - テストケース作成
3. `/tdd-red` - テスト実装（失敗）
4. `/tdd-green` - 最小実装
5. `/tdd-refactor` - リファクタリング
6. `/tdd-verify-complete` - 品質確認

### DIRECTタスク（参考手順）
1. `/direct-setup` - 直接実装・設定
2. `/direct-verify` - 動作確認・品質確認

# info

## AskUserQuestion ツールの使用例

すべてのヒアリングは AskUserQuestion ツールを使用して行います。以下は具体的な使用例です。

### タスク粒度確認

```
AskUserQuestion({
  questions: [{
    question: "1タスクあたりの粒度（ストーリーポイント上限）はどの程度にしますか？",
    header: "タスク粒度",
    multiSelect: false,
    options: [
      { label: "標準（最大5SP程度）", description: "標準的な実装単位でタスク分割" },
      { label: "細かめ（最大3SP程度）", description: "より小さい単位に細分化" }
    ]
  }]
})
```

### 優先順位確認

```
AskUserQuestion({
  questions: [{
    question: "以下のタスクグループの実装優先順位を教えてください",
    header: "優先順位",
    multiSelect: false,
    options: [
      { label: "基盤→バックエンド→フロントエンド", description: "標準的な実装順序" },
      { label: "フロントエンド優先", description: "UI/UXの早期確認を重視" },
      { label: "並行開発", description: "可能な限り並行して開発" }
    ]
  }]
})
```

### テスト要件確認

```
AskUserQuestion({
  questions: [{
    question: "単体テストのカバレッジ目標を教えてください",
    header: "カバレッジ",
    multiSelect: false,
    options: [
      { label: "80%以上", description: "高いカバレッジを目指す" },
      { label: "60%以上", description: "標準的なカバレッジ" },
      { label: "主要機能のみ", description: "最小限のテスト" }
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
