import type { Notification } from "@fido/shared";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CalendarX,
  CheckCircle2,
  CreditCard,
  Footprints,
  Handshake,
  Inbox,
  XCircle,
  type LucideIcon,
} from "lucide-react-native";
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

/** Il backend usa una manciata di prefissi di `type` per ogni evento che
 * genera una notifica (vedi backend/src/modules/*​/​*.service.ts,
 * notifyUser(...)) — qui li mappiamo a un'icona coerente invece di
 * mostrare sempre la stessa campanella per qualunque evento. Prefisso
 * (non match esatto) perché stati come "dispute_opened"/"dispute_resolved"
 * condividono la stessa icona. */
function notificationIcon(type: string): LucideIcon {
  if (type.startsWith("booking_request")) return Inbox;
  if (type.startsWith("booking_accepted") || type.startsWith("meet_greet_accepted")) return CheckCircle2;
  if (type.startsWith("booking_declined") || type.startsWith("meet_greet_declined")) return XCircle;
  if (type.startsWith("booking_cancelled")) return CalendarX;
  if (type.startsWith("booking_paid")) return CreditCard;
  if (type.startsWith("meet_greet")) return Handshake;
  if (type.startsWith("service_update")) return Footprints;
  if (type.startsWith("dispute")) return AlertTriangle;
  return Bell;
}

export default function NotificationsScreen() {
  const { colors, spacing, radius, typography } = useTheme();
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
        renderItem={({ item }) => {
          const Icon = notificationIcon(item.type);
          return (
            <Card onPress={() => handlePress(item)} style={{ marginBottom: spacing.sm, opacity: item.isRead ? 0.65 : 1 }}>
              <View style={{ flexDirection: "row" }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radius.md,
                    backgroundColor: item.isRead ? colors.surfaceMuted : colors.accentSoft,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: spacing.md,
                  }}
                >
                  <Icon size={17} color={item.isRead ? colors.inkFaint : colors.accent} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
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
                </View>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: spacing.xl }}>
            <BellOff size={32} color={colors.inkFaint} strokeWidth={1.5} />
            <Text style={[typography.body, { color: colors.inkFaint, marginTop: spacing.sm, textAlign: "center" }]}>
              {strings.notifications.empty}
            </Text>
          </View>
        }
      />
    </Screen>
  );
}
