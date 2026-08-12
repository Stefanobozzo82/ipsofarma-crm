import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email("Email non valida"),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri"),
  firstName: z.string().min(1, "Il nome è obbligatorio"),
  lastName: z.string().min(1, "Il cognome è obbligatorio"),
  gdprConsent: z.literal(true, {
    errorMap: () => ({ message: "Il consenso al trattamento dei dati è obbligatorio" }),
  }),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email("Email non valida"),
  password: z.string().min(1, "Password obbligatoria"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

/** Scambio del token nativo Google/Apple con una sessione Supabase
 * (flusso consigliato per mobile: supabase.auth.signInWithIdToken). */
export const oauthExchangeSchema = z.object({
  idToken: z.string().min(1),
  nonce: z.string().optional(),
});
export type OAuthExchangeInput = z.infer<typeof oauthExchangeSchema>;

export const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().min(6).optional(),
  city: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  avatarUrl: z.string().url().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
