import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from "@expo-google-fonts/nunito";
import { StripeProvider } from "@stripe/stripe-react-native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { env } from "@/lib/env";
import { useAuthStore } from "@/store/auth-store";

// Resta visibile finché i font non sono pronti — evita un flash di testo
// col font di sistema prima che Nunito/Inter carichino (soprattutto visibile
// alla prima apertura, quando non sono ancora in cache).
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  // useFonts di expo-font direttamente, non il re-export di
  // @expo-google-fonts/* (usati qui solo per le costanti dei font, dei
  // semplici require() senza dipendenze). Quei pacchetti non dichiarano
  // "react" tra le proprie dipendenze: sotto pnpm, il loro useFonts può
  // risolvere un'istanza di React diversa da quella dell'app, causando
  // "Invalid hook call" — expo-font è invece una dipendenza diretta vera
  // di mobile/package.json, sempre risolta correttamente.
  const [fontsReady] = useFonts({
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StripeProvider publishableKey={env.STRIPE_PUBLISHABLE_KEY}>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
        </StripeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
