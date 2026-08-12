import { Stack } from "expo-router";
import { strings } from "@/i18n/strings";
import { useTheme } from "@/theme/use-theme";

export default function SitterDashboardLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        headerBackTitle: "",
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: strings.sitterDashboard.title }} />
      <Stack.Screen name="requests" options={{ title: strings.sitterDashboard.requestsTitle }} />
      <Stack.Screen name="calendar" options={{ title: strings.sitterDashboard.calendarTitle }} />
      <Stack.Screen name="payouts" options={{ title: strings.sitterDashboard.payoutsTitle }} />
      <Stack.Screen name="services" options={{ title: strings.sitterDashboard.servicesTitle }} />
      <Stack.Screen name="availability" options={{ title: strings.sitterDashboard.availabilityTitle }} />
    </Stack>
  );
}
