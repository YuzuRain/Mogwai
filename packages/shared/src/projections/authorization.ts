import { z } from "zod";

/**
 * 授权投影(architecture A4 投影 3,tech-design §2.5)—— billing 在账本变动后
 * 异步刷新;platform_auth 据此软预检,key_resolver 据此做债务清偿路由。
 * Redis string(JSON),键:`proj:authz:<user_id>`。
 * 投影是近似值,允许并发窗口内小幅越限,权威在账本;
 * 网关只做数值比较,业务规则全部留在 billing。
 *
 * 缺失语义:投影不存在 = 放行(fail-open)——新用户没有账本活动就没有投影,
 * 属正常态;billing 必须保证「有账本活动就有投影」,该保证是 402 软预检生效的前提。
 */
export const debtEntrySchema = z.object({
  /** 债权人(清偿路由的受益方)。 */
  creditor_user_id: z.string().min(1),
  amount_cp: z.number().int().positive(),
  /** 多债权人按发生时间先进先出(tech-design §10.3)。 */
  incurred_at: z.iso.datetime({ offset: true }),
});

export const authorizationProjectionSchema = z.object({
  /** 未付服务费(CP);超过 billing 配置的阈值 → 网关 402。 */
  service_fee_owed_cp: z.number().int().nonnegative(),
  /** 用户自设担保额度上限(users.pledge_limit_cp)减去已锁定部分。 */
  pledge_available_cp: z.number().int().nonnegative(),
  /** 我欠别人的(作为债务人)。 */
  debts: z.array(debtEntrySchema),
  /** 别人欠我的(作为债权人);key_resolver 依此优先路由到债务人 Key。 */
  credits: z.array(debtEntrySchema.omit({ creditor_user_id: true }).extend({
    debtor_user_id: z.string().min(1),
  })),
  /** billing 主动下发的硬拒绝标记(越限熔断)。 */
  blocked: z.boolean(),
});

export type AuthorizationProjection = z.infer<typeof authorizationProjectionSchema>;

export function authorizationProjectionKey(userId: string): string {
  return `proj:authz:${userId}`;
}
