import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, useFonts as useInterFonts } from "@expo-google-fonts/inter";
import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, useFonts as useNunitoFonts } from "@expo-google-fonts/nunito";
import { StripeProvider } from "@stripe/stripe-react-native";
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
  const [nunitoLoaded] = useNunitoFonts({ Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold });
  const [interLoaded] = useInterFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const fontsReady = nunitoLoaded && interLoaded;

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
