import { z } from "zod";

export const approveSitterSchema = z.object({
  approve: z.boolean(),
  reason: z.string().max(500).optional(),
});
export type ApproveSitterInput = z.infer<typeof approveSitterSchema>;

export const moderateReviewSchema = z.object({
  isHidden: z.boolean(),
  notes: z.string().max(500).optional(),
});
export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;

export const createDisputeSchema = z.object({
  reason: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
});
export type CreateDisputeInput = z.infer<typeof createDisputeSchema>;

export const resolveDisputeSchema = z.object({
  status: z.enum(["investigating", "resolved", "closed"]),
  resolution: z.string().max(2000).optional(),
});
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;
