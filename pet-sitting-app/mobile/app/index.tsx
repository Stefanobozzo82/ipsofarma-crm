import { Redirect } from "expo-router";
import { LoadingView } from "@/components/LoadingView";
import { useAuthStore } from "@/store/auth-store";

/** Punto di ingresso: smista verso login o tab principali in base allo
 * stato di sessione già caricato dal root layout. */
export default function Index() {
  const status = useAuthStore((s) => s.status);

  if (status === "loading") return <LoadingView />;
  if (status === "signedIn") return <Redirect href="/(tabs)" />;
  return <Redirect href="/(auth)/login" />;
}
