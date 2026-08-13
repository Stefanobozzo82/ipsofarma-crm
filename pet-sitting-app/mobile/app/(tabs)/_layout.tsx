import { Tabs } from "expo-router";
import { CalendarDays, MessageCircle, Search, User } from "lucide-react-native";
import { useEffect } from "react";
import { Platform, StyleSheet } from "react-native";
import { strings } from "@/i18n/strings";
import { registerForPushNotifications } from "@/lib/push-notifications";
import { useTheme } from "@/theme/use-theme";

export default function TabsLayout() {
  const { colors, typography, shadow } = useTheme();

  // Solo qui, non nel root layout: questo albero di rotte monta solo dopo
  // il login, quando esiste un utente a cui associare il token.
  useEffect(() => {
    registerForPushNotifications();
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarLabelStyle: { fontFamily: typography.label.fontFamily, fontSize: 11, textTransform: "none" },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          borderTopWidth: Platform.OS === "android" ? StyleSheet.hairlineWidth : 0,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
          ...shadow.md,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: strings.search.title,
          tabBarIcon: ({ color, size }) => <Search color={color} size={size - 2} strokeWidth={2.25} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: strings.bookingsTab.title,
          tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size - 2} strokeWidth={2.25} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: strings.chat.tabTitle,
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size - 2} strokeWidth={2.25} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: strings.profile.title,
          tabBarIcon: ({ color, size }) => <User color={color} size={size - 2} strokeWidth={2.25} />,
        }}
      />
    </Tabs>
  );
}
