import type { UserWithProfiles } from "@fido/shared";
import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";

interface AuthState {
  /** 'forbidden' = login riuscito ma l'utente non ha role='admin' —
   * distinto da 'signedOut' perché la UI deve mostrare un messaggio
   * diverso (non "inserisci le credenziali", ma "account non autorizzato"). */
  status: "loading" | "signedOut" | "signedIn" | "forbidden";
  session: Session | null;
  profile: UserWithProfiles | null;
  error: string | null;
  initialize: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

async function loadProfile(session: Session, set: (partial: Partial<AuthState>) => void) {
  set({ session });
  try {
    const profile = await apiFetch<UserWithProfiles>("/users/me");
    set({ profile, status: profile.role === "admin" ? "signedIn" : "forbidden" });
  } catch {
    set({ status: "forbidden" });
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  session: null,
  profile: null,
  error: null,

  initialize: () => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) loadProfile(data.session, set);
      else set({ status: "signedOut" });
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) loadProfile(session, set);
      else set({ session: null, profile: null, status: "signedOut" });
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

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null, status: "signedOut" });
  },
}));
