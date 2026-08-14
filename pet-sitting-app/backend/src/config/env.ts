import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SUPABASE_URL: z.string().url({ message: "SUPABASE_URL mancante o non valida — vedi .env.example" }),
  SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY mancante — vedi .env.example"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY mancante — vedi .env.example"),
  CORS_ORIGIN: z.string().default("http://localhost:8081"),

  // Opzionali: senza queste il server si avvia comunque (utile per lavorare
  // su auth/profili/ricerca senza un account Stripe), ma le rotte di
  // pagamento rispondono 503 finché non sono configurate — vedi lib/stripe.ts.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // URL di ritorno dell'onboarding Stripe Connect Express — per l'MVP un
  // placeholder web; da sostituire con un deep link mobile in Fase 5/6.
  STRIPE_CONNECT_REFRESH_URL: z.string().default("https://fido.app/stripe/onboarding/refresh"),
  STRIPE_CONNECT_RETURN_URL: z.string().default("https://fido.app/stripe/onboarding/complete"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
  throw new Error(
    `Configurazione ambiente non valida. Copia backend/.env.example in backend/.env e compilalo:\n${issues}`,
  );
}

export const env = parsed.data;
