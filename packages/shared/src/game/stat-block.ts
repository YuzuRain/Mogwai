import { z } from "zod";

/** 六维属性块,键名与 PostgreSQL trainers.evs/ivs jsonb 一致(architecture B3)。 */
export const statBlockSchema = z.object({
  hp: z.number().int(),
  atk: z.number().int(),
  def: z.number().int(),
  spa: z.number().int(),
  spd: z.number().int(),
  spe: z.number().int(),
});

export type StatBlock = z.infer<typeof statBlockSchema>;

export const statKeySchema = statBlockSchema.keyof();
export type StatKey = z.infer<typeof statKeySchema>;
