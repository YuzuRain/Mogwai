import { z } from "zod";

/**
 * 账本科目(tech-design §3.5:关系型科目,txn 双方同科目反符号)。
 * DB CHECK、billing 记账与 API DTO 共用此单一权威。
 */
export const LEDGER_ACCOUNTS = ["pledge", "debt", "service_fee"] as const;
export const ledgerAccountSchema = z.enum(LEDGER_ACCOUNTS);
export type LedgerAccount = z.infer<typeof ledgerAccountSchema>;

/** 平台哨兵账户:账本双录的平台侧对手方(§3.5),迁移写入 users 表。 */
export const PLATFORM_USER_ID = "PLATFORM";
