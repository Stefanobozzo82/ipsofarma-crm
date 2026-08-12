import { StripeProvider } from "@stripe/stripe-react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { env } from "@/lib/env";
import { useAuthStore } from "@/store/auth-store";

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

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
