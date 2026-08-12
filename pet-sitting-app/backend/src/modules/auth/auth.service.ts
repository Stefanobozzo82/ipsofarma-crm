import type { LoginInput, OAuthExchangeInput, SignupInput } from "@fido/shared";
import { AppError } from "../../lib/app-error";
import { supabaseAnon } from "../../lib/supabase";

/**
 * Nota architetturale: l'app mobile può (e per la maggior parte dei flussi
 * dovrebbe) chiamare il SDK Supabase direttamente per signUp/signIn/refresh —
 * è il pattern standard, gestisce da solo il refresh dei token. Queste rotte
 * esistono comunque per: validazione lato server con gli stessi schemi Zod
 * usati dal resto dell'API, un punto unico da cui in futuro agganciare side
 * effect (email di benvenuto, analytics), e i client che non usano l'SDK
 * (es. pannello admin).
 */

export async function signup(input: SignupInput) {
  const { data, error } = await supabaseAnon.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        first_name: input.firstName,
        last_name: input.lastName,
        gdpr_consent: input.gdprConsent,
      },
    },
  });

  if (error) throw AppError.badRequest(error.message, "signup_failed");
  return data; // { user, session } — session è null se è richiesta conferma email
}

export async function login(input: LoginInput) {
  const { data, error } = await supabaseAnon.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error) throw new AppError(401, "invalid_credentials", "Email o password non corretti");
  return data; // { user, session }
}

export async function refresh(refreshToken: string) {
  const { data, error } = await supabaseAnon.auth.refreshSession({ refresh_token: refreshToken });
  if (error) throw AppError.unauthorized("Refresh token non valido o scaduto");
  return data;
}

const OAUTH_PROVIDERS = ["google", "apple"] as const;
type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isSupportedOAuthProvider(provider: string): provider is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(provider);
}

/**
 * Scambia l'ID token nativo (da Google/Apple Sign-In lato mobile) con una
 * sessione Supabase — il flusso raccomandato da Supabase per il login
 * social su app native, alternativo al redirect OAuth via browser.
 */
export async function oauthExchange(provider: OAuthProvider, input: OAuthExchangeInput) {
  const { data, error } = await supabaseAnon.auth.signInWithIdToken({
    provider,
    token: input.idToken,
    nonce: input.nonce,
  });

  if (error) throw new AppError(401, "oauth_failed", `Accesso con ${provider} non riuscito: ${error.message}`);
  return data;
}
