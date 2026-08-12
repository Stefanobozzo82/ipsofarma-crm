import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SUPABASE_URL: z.string().url({ message: "SUPABASE_URL mancante o non valida — vedi .env.example" }),
  SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY mancante — vedi .env.example"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY mancante — vedi .env.example"),
  CORS_ORIGIN: z.string().default("http://localhost:8081"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
  throw new Error(
    `Configurazione ambiente non valida. Copia backend/.env.example in backend/.env e compilalo:\n${issues}`,
  );
}

export const env = parsed.data;
