import type { UserWithProfiles } from "@fido/shared";
import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";

interface AuthState {
  status: "loading" | "signedOut" | "signedIn";
  session: Session | null;
  profile: UserWithProfiles | null;
  error: string | null;
  initialize: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  /** Ritorna true se la sessione è attiva subito dopo la registrazione
   * (conferma email disattivata sul progetto Supabase), false se resta da
   * confermare via email — la schermata di signup mostra un esito diverso
   * nei due casi. */
  signUp: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    gdprConsent: boolean;
  }) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

/**
 * L'auth vera e propria (signUp/signIn/sessione/refresh token) passa dal
 * client Supabase direttamente, come consigliato per le app mobile — vedi
 * la nota in backend/src/modules/auth/auth.service.ts. Il profilo
 * applicativo (owner/sitter/animali collegati) viene invece dal backend
 * Express via GET /users/me, che aggrega più tabelle in una risposta sola.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  session: null,
  profile: null,
  error: null,

  initialize: () => {
    supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session, status: data.session ? "signedIn" : "signedOut" });
      if (data.session) get().refreshProfile();
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, status: session ? "signedIn" : "signedOut" });
      if (session) {
        get().refreshProfile();
      } else {
        set({ profile: null });
      }
    });
  },

  signIn: async (email, password) => {
    set({ error: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ error: error.message });
      throw error;
    }
  },

  signUp: async ({ email, password, firstName, lastName, gdprConsent }) => {
    set({ error: null });
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName, last_name: lastName, gdpr_consent: gdprConsent } },
    });
    if (error) {
      set({ error: error.message });
      throw error;
    }
    return data.session !== null;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null, status: "signedOut" });
  },

  refreshProfile: async () => {
    try {
      const profile = await apiFetch<UserWithProfiles>("/users/me");
      set({ profile });
    } catch (err) {
      // Il profilo può non essere ancora pronto subito dopo la signup (il
      // trigger su auth.users che crea public.users è asincrono di fatto
      // solo per una frazione di secondo) — non è un errore da mostrare.
      console.warn("Impossibile caricare il profilo", err);
    }
  },
}));
