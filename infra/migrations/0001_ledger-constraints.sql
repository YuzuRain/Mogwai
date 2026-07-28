-- 账本结构性约束(tech-design §3.5)。drizzle schema 表达不了触发器,
-- 约束收在这份手写迁移里;改动账本语义必须同步 §3.5 与 architecture B3。

-- 1) 双录一致性:每 txn Σdelta_cp = 0 且 ≥2 条分录。
--    延迟约束触发器:同一事务内逐条 INSERT 不受限,COMMIT 时校验,
--    应用层写出不平衡的账直接提交失败,不存在"先记上再说"的路径。
CREATE OR REPLACE FUNCTION ledger_txn_balance_check() RETURNS trigger AS $$
DECLARE
  total BIGINT;
  legs  INT;
BEGIN
  SELECT sum(delta_cp), count(*) INTO total, legs
  FROM ledger_entries WHERE txn_id = NEW.txn_id;
  IF total <> 0 THEN
    RAISE EXCEPTION 'ledger: txn % unbalanced (sum=% cp); every txn must net to zero (tech-design §3.5)',
      NEW.txn_id, total;
  END IF;
  IF legs < 2 THEN
    RAISE EXCEPTION 'ledger: txn % has % leg(s); double-entry requires >= 2 (tech-design §3.5)',
      NEW.txn_id, legs;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER ledger_txn_balance
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_txn_balance_check();
--> statement-breakpoint

-- 2) 只增不改:更正一律写冲销 txn(reason=reversal,ref_type=txn)。
CREATE OR REPLACE FUNCTION ledger_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger: entries are append-only; corrections must be reversal txns (tech-design §3.5)';
END $$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER ledger_no_update_delete
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
--> statement-breakpoint

-- 3) PLATFORM 哨兵账户:账本双录的平台侧对手方(服务费/质押的镜像分录)。
INSERT INTO users (id, email, tier, privacy_mode, pledge_limit_cp)
VALUES ('PLATFORM', 'platform@mogwai.internal', 'internal', false, 0)
ON CONFLICT (id) DO NOTHING;
