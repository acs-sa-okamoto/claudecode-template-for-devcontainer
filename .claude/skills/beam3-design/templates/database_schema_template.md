# {要件名} データベーススキーマ

**作成日**: {作成日時}
**関連設計**: [architecture.md](architecture.md)
**関連要件定義**: [requirements.md](../requirements.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: PRD・要件定義書・既存の設計文書・ユーザヒアリングを参考にした確実な定義
- 🟡 **黄信号**: PRD・要件定義書・既存の設計文書・ユーザヒアリングから妥当な推測による定義
- 🔴 **赤信号**: PRD・要件定義書・既存の設計文書・ユーザヒアリングにない推測による定義

-- ========================================
-- テーブル定義
-- ========================================

-- {テーブル名1}
-- 🔵 信頼性: 要件定義REQ-001・既存DBスキーマより
CREATE TABLE {table_name1} (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- 🔵 既存DBスキーマの共通パターン
    {column1} VARCHAR(255) NOT NULL, -- 🔵 要件定義より
    {column2} INTEGER DEFAULT 0, -- 🟡 要件から妥当な推測
    {column3} TIMESTAMP WITH TIME ZONE, -- 🔵 要件定義より
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 🔵 共通パターン
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 🔵 共通パターン

    -- 制約
    CONSTRAINT {constraint_name} CHECK ({column2} >= 0) -- 🔵 要件定義の制約より
);

-- {テーブル名2}
-- 🟡 信頼性: 要件から妥当な推測
-- 備考: {確認が必要な理由}
CREATE TABLE {table_name2} (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- 🔵 既存DBスキーマの共通パターン
    {column1} VARCHAR(255) UNIQUE NOT NULL, -- 🟡 要件から推測
    {foreign_key_column} UUID REFERENCES {table_name1}(id), -- 🔵 リレーションシップより
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 🔵 共通パターン
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- 🔵 共通パターン
);

-- ========================================
-- インデックス
-- ========================================

-- 検索パフォーマンス向上のためのインデックス
-- 🔵 信頼性: パフォーマンス要件・既存DBスキーマより
CREATE INDEX idx_{table_name1}_{column1} ON {table_name1}({column1}); -- 🔵 頻繁な検索条件より

-- 🟡 信頼性: パフォーマンス要件から妥当な推測
CREATE INDEX idx_{table_name2}_{column1} ON {table_name2}({column1}); -- 🟡 検索の可能性を考慮

-- ========================================
-- リレーションシップ（外部キー制約）
-- ========================================

-- {table_name2} と {table_name1} の関連
-- 🔵 信頼性: データモデル設計・要件定義より
ALTER TABLE {table_name2}
    ADD CONSTRAINT fk_{table_name2}_{table_name1}
    FOREIGN KEY ({foreign_key_column})
    REFERENCES {table_name1}(id)
    ON DELETE CASCADE; -- 🔵 要件定義の削除動作より

-- ========================================
-- トリガー
-- ========================================

-- updated_at 自動更新トリガー
-- 🔵 信頼性: 既存DBスキーマの共通パターンより
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_{table_name1}_updated_at
    BEFORE UPDATE ON {table_name1}
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); -- 🔵 共通パターン

-- ========================================
-- 初期データ（必要に応じて）
-- ========================================

-- マスターデータの初期投入
-- 🔵 信頼性: 要件定義・既存データより
INSERT INTO {table_name1} ({column1}, {column2}) VALUES
    ('{value1}', {num1}), -- 🔵 要件定義より
    ('{value2}', {num2}); -- 🔵 要件定義より

-- ========================================
-- パフォーマンス最適化
-- ========================================

-- ANALYZE文（統計情報更新）
-- 🔵 信頼性: 既存DBスキーマの運用パターンより
ANALYZE {table_name1};
ANALYZE {table_name2};

-- ========================================
-- 関連文書
-- ========================================
-- - アーキテクチャ: ./architecture.md
-- - データフロー: ./dataflow.md
-- - 型定義: ./interfaces.ts
-- - API仕様: ./api-endpoints.md
-- - 要件定義: ../requirements.md

-- ========================================
-- 信頼性レベルサマリー
-- ========================================
-- - 🔵 青信号: {件数}件 ({割合}%)
-- - 🟡 黄信号: {件数}件 ({割合}%)
-- - 🔴 赤信号: {件数}件 ({割合}%)
--
-- 品質評価: {高品質/要改善/要ヒアリング}
