---
description: テスト実行速度を分析し、遅いテストのリファクタリング提案を行います
---

# テスト実行速度分析とリファクタリング

## 目的

テストスイート全体の実行速度を分析し、遅いテスト（2秒以上）を特定してリファクタリング提案を行います。

## step

### step1: 追加ルールの読み込み

- `docs/rule` ディレクトリが存在する場合は読み込み
- `docs/rule/test-optimization` ディレクトリが存在する場合は読み込み
- `.claude/commands/test-optimization-patterns.md` を読み込み
- 各ディレクトリ内のすべてのファイルを読み込み、追加ルールとして適用

### step2: テスト実行時間の計測

**全体の実行時間計測**:

```bash
# Jest の場合
npm test -- --verbose --runInBand 2>&1 | tee test-timing-before.log

# その他のテストランナーの場合
# pytest: pytest -v --durations=0
# go test: go test -v -timeout 30s ./...
```

テスト結果から以下の情報を収集:
- 各テストファイルの実行時間
- 個別テストケースの実行時間
- 総実行時間

実行時間を記録し、以下の基準で分類:
- 🟢 高速: 100ms未満
- 🟡 中速: 100ms～500ms
- 🟠 やや遅い: 500ms～2秒
- 🔴 遅い: 2秒以上

### step3: 遅いテストの特定と原因分析

**Task tool (subagent_type: Explore, thoroughness: medium)** を使用して、🔴遅いテスト（2秒以上）のファイルを探索し、以下の観点で分析:

#### 分析チェックリスト

1. **データベースアクセス**
   - [ ] 各テストでDB接続・切断を繰り返していないか
   - [ ] beforeEach で毎回データをクリア・再投入していないか
   - [ ] トランザクションのロールバックが使えないか
   - [ ] beforeAll でデータ共有できないか

2. **ファイルI/O**
   - [ ] 実ファイルへの読み書きを行っていないか
   - [ ] 一時ファイルの作成・削除が多くないか
   - [ ] mock-fs や jest.mock('fs') が使えないか

3. **外部依存**
   - [ ] 外部APIへの実際のリクエストを行っていないか
   - [ ] ネットワーク呼び出しがモック化されているか
   - [ ] MSW や jest.mock が使えないか

4. **非同期処理**
   - [ ] 固定時間の sleep/wait を使っていないか
   - [ ] 条件ベースの待機に変更できないか
   - [ ] 不要な待機処理がないか

5. **セットアップ/ティアダウン**
   - [ ] beforeEach で重い処理をしていないか
   - [ ] beforeAll で共有できる処理が beforeEach にないか
   - [ ] afterEach で不要なクリーンアップをしていないか

6. **テストデータ**
   - [ ] 必要以上に大きなデータを作成していないか
   - [ ] ファクトリーパターンで最小限のデータにできないか

### step4: リファクタリング提案の作成

分析結果に基づき、適用可能なリファクタリングパターンを提案:

#### パターン1: データベーストランザクション（効果: ★★★★★）

**適用条件**: beforeEach でデータのクリア・再投入を行っている

**提案**:
```javascript
// Before
beforeEach(async () => {
  await db.query('DELETE FROM users');
  await db.query('INSERT INTO users ...');
});

// After: トランザクションでロールバック
let transaction;
beforeEach(async () => {
  transaction = await db.transaction();
});
afterEach(async () => {
  await transaction.rollback();
});
```

#### パターン2: ファイルI/Oのモック化（効果: ★★★★★）

**適用条件**: fs.readFile, fs.writeFile などの実ファイル操作

**提案**:
```javascript
// Before
await fs.writeFile('./config.json', data);

// After: モック化
jest.mock('fs/promises');
const fs = require('fs/promises');
fs.writeFile.mockResolvedValue();
```

#### パターン3: 外部APIのモック化（効果: ★★★★★）

**適用条件**: fetch, axios などの外部HTTP通信

**提案**:
```javascript
// Before
const data = await fetch('https://api.example.com/users');

// After: MSWでモック
import { setupServer } from 'msw/node';
import { rest } from 'msw';

const server = setupServer(
  rest.get('https://api.example.com/users', (req, res, ctx) => {
    return res(ctx.json([{id: 1, name: 'Test'}]));
  })
);
```

#### パターン4: beforeEach → beforeAll（効果: ★★★☆☆）

**適用条件**: 読み取り専用のテストでデータを変更しない

**提案**:
```javascript
// Before
beforeEach(async () => {
  testData = await generateComplexData(); // 各テストで実行
});

// After: 一度だけ実行
beforeAll(async () => {
  testData = await generateComplexData(); // 一度だけ
});
```

#### パターン5: 非同期待機の最適化（効果: ★★★☆☆）

**適用条件**: setTimeout, sleep などの固定待機時間

**提案**:
```javascript
// Before
await new Promise(resolve => setTimeout(resolve, 5000));

// After: 条件ベースの待機
await waitFor(async () => {
  const status = await getStatus();
  return status === 'completed';
}, {timeout: 5000, interval: 100});
```

#### パターン6: テストデータファクトリー（効果: ★★☆☆☆）

**適用条件**: 複雑なデータ構造を毎回生成している

**提案**:
```javascript
// Before
const user = {
  id: 1, name: 'Test', email: 'test@example.com',
  address: { /* 詳細 */ }, preferences: { /* 詳細 */ }
};

// After: ファクトリー関数
function createUser(overrides = {}) {
  return { id: 1, name: 'Test', ...overrides };
}
const user = createUser({ name: 'Custom' });
```

### step5: ユーザーへの確認

**AskUserQuestion** ツールを使用して、以下を確認:
- 検出された遅いテストの一覧を表示
- 提案されたリファクタリングパターンを説明
- 実施するか、レポートのみで終了するかを選択

### step6: リファクタリング実行（ユーザーが実施を選択した場合）

提案されたパターンを1つずつ適用:

1. **1つのテストファイルを選択**
2. **提案されたパターンを適用**
3. **テストを実行して確認**
   ```bash
   npm test -- <test-file>
   ```
4. **実行時間を記録**
5. **次のファイルへ**

各改善後:
- ✅ テストが全て通ることを確認
- ✅ 実行時間が改善されたことを確認
- ✅ 改善内容をログに記録

### step7: 改善効果の測定

```bash
# 改善後の実行時間を計測
npm test -- --verbose --runInBand 2>&1 | tee test-timing-after.log
```

改善前後を比較:
- 総実行時間の変化
- 個別ファイルの実行時間変化
- 改善率の計算

### step8: レポート作成

改善レポートを作成し、以下の情報を記録:

```markdown
# テスト実行速度改善レポート

## 改善サマリー
- 改善前の総実行時間: XX.X秒
- 改善後の総実行時間: XX.X秒
- 短縮時間: XX.X秒（XX%削減）
- 改善対象テスト数: XX個

## 遅いテストの詳細

### 1. `test/user.test.js` - 15.2秒 → 2.1秒（86%削減）
- **原因**: 各テストでDB接続・切断を繰り返し
- **適用パターン**: トランザクショナルテスト
- **改善内容**:
  - beforeEach でトランザクション開始
  - afterEach でロールバック
- **効果**: 13.1秒短縮

### 2. `test/file-processor.test.js` - 8.5秒 → 0.3秒（96%削減）
- **原因**: 実ファイルへの書き込み
- **適用パターン**: ファイルI/Oのモック化
- **改善内容**:
  - mock-fs を使用
  - メモリ上でファイル操作
- **効果**: 8.2秒短縮

## まだ遅いテスト（2秒以上）

### 1. `test/integration.test.js` - 5.3秒
- **原因**: 統合テストとして複数の処理を実行
- **推奨**: E2Eテストとして分離を検討
- **優先度**: 中

## 推奨される次のステップ

1. 統合テストのE2E化の検討
2. テストデータファクトリーの導入
3. 並列実行の最適化（--maxWorkers調整）

## 適用したリファクタリングパターン

1. データベーストランザクション: 3ファイル
2. ファイルI/Oのモック化: 2ファイル
3. 外部APIのモック化: 1ファイル
4. beforeEach → beforeAll: 2ファイル
```

レポートを以下のファイルに保存:
- `docs/test-performance-improvement-report.md`

## rules

- **テストの品質を下げない**: 速度のためにテストカバレッジを犠牲にしない
- **段階的な改善**: 一度に全てを変更せず、1ファイルずつ改善
- **実装コードは変更しない**: テストコードのみをリファクタリング
- **モックは適切に**: 過度なモック化は実際のバグを見逃す可能性
- **テスト実行で確認**: 各改善後に必ずテストを実行して動作確認

## 注意事項

### 改善を見送るべきケース

- **統合テスト・E2Eテスト**: 実際の動作確認が目的なのでモック化は不適切
- **パフォーマンステスト**: 実行時間の計測が目的
- **セキュリティテスト**: 実際の環境での動作確認が必要

これらは別のテストスイート（`test:e2e`, `test:integration`）として分離を推奨
