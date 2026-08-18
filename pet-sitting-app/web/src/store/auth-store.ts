import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";
import { supabase } from "@/lib/supabase";

interface AuthState {
  status: "loading" | "signedOut" | "signedIn";
  session: Session | null;
  error: string | null;
  initialize: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  /** Ritorna true se la sessione è attiva subito dopo la registrazione
   * (conferma email disattivata sul progetto Supabase), false se resta da
   * confermare via email — stessa logica di mobile/src/store/auth-store.ts. */
  signUp: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    gdprConsent: boolean;
  }) => Promise<boolean>;
  signOut: () => Promise<void>;
}

/**
 * Auth vera (stesso progetto Supabase di mobile/admin/backend) — a
 * differenza di mobile/admin qui non c'è un `refreshProfile()` che chiama
 * GET /users/me: il sito non ha una vera "area personale" da popolare
 * (vedi pages/AccountPage.tsx), quindi nome/cognome mostrati vengono
 * direttamente da `session.user.user_metadata`, senza bisogno di un'altra
 * chiamata autenticata al backend.
 */
export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  session: null,
  error: null,

  initialize: () => {
    supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session, status: data.session ? "signedIn" : "signedOut" });
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, status: session ? "signedIn" : "signedOut" });
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
    set({ session: null, status: "signedOut" });
  },
}));
