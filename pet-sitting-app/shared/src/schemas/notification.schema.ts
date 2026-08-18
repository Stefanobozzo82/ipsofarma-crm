import { z } from "zod";

export const registerPushTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android"]),
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;
