import type { Notification } from "@fido/shared";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorView } from "@/components/ErrorView";
import { LoadingView } from "@/components/LoadingView";
import { Screen } from "@/components/Screen";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/features/notifications/api";
import { strings } from "@/i18n/strings";
import { useTheme } from "@/theme/use-theme";

export default function NotificationsScreen() {
  const { colors, spacing, typography } = useTheme();
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listNotifications()
      .then(setNotifications)
      .catch(() => setError(strings.common.genericError));
  }, []);

  useEffect(load, [load]);

  async function handlePress(notification: Notification) {
    if (!notification.isRead) {
      setNotifications((prev) => prev?.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)) ?? null);
      await markNotificationRead(notification.id).catch(() => {});
    }
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev?.map((n) => ({ ...n, isRead: true })) ?? null);
    await markAllNotificationsRead().catch(() => {});
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (notifications === null) return <LoadingView />;

  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <Screen>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg }}>
        <Text style={[typography.display, { color: colors.ink }]}>{strings.notifications.title}</Text>
      </View>

      {hasUnread && (
        <View style={{ marginBottom: spacing.md }}>
          <Button label={strings.notifications.markAllRead} onPress={handleMarkAllRead} variant="secondary" />
        </View>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card onPress={() => handlePress(item)} style={{ marginBottom: spacing.sm, opacity: item.isRead ? 0.6 : 1 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <Text style={[typography.subtitle, { color: colors.ink, flex: 1 }]}>{item.title}</Text>
              {!item.isRead && (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: 6 }} />
              )}
            </View>
            <Text style={[typography.body, { color: colors.inkMuted, marginTop: spacing.xs }]}>{item.body}</Text>
            <Text style={[typography.caption, { color: colors.inkFaint, marginTop: spacing.xs }]}>
              {new Date(item.createdAt).toLocaleString("it-IT")}
            </Text>
          </Card>
        )}
        ListEmptyComponent={
          <Text style={[typography.body, { color: colors.inkFaint, marginTop: spacing.xl, textAlign: "center" }]}>
            {strings.notifications.empty}
          </Text>
        }
      />
    </Screen>
  );
}
