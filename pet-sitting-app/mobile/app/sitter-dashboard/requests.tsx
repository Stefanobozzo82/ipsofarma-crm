import type { Booking } from "@fido/shared";
import { CalendarDays, Inbox } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorView } from "@/components/ErrorView";
import { LoadingView } from "@/components/LoadingView";
import { Screen } from "@/components/Screen";
import { acceptBooking, declineBooking, listMyBookings } from "@/features/bookings/api";
import { strings } from "@/i18n/strings";
import { formatDateIt } from "@/lib/date";
import { useAuthStore } from "@/store/auth-store";
import { useTheme } from "@/theme/use-theme";

export default function SitterRequestsScreen() {
  const { colors, spacing, typography } = useTheme();
  const myId = useAuthStore((s) => s.profile?.id);

  const [requests, setRequests] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const bookings = await listMyBookings("pending_request");
      setRequests(bookings.filter((b) => b.sitterId === myId));
    } catch {
      setError(strings.common.genericError);
    }
  }, [myId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAccept(id: string) {
    setActingOn(id);
    try {
      await acceptBooking(id);
      load();
    } catch {
      Alert.alert(strings.common.genericError);
    } finally {
      setActingOn(null);
    }
  }

  function handleDecline(id: string) {
    Alert.alert(strings.booking.decline, strings.booking.cancelConfirm, [
      { text: strings.common.cancel, style: "cancel" },
      {
        text: strings.booking.decline,
        style: "destructive",
        onPress: async () => {
          setActingOn(id);
          try {
            await declineBooking(id, {});
            load();
          } catch {
            Alert.alert(strings.common.genericError);
          } finally {
            setActingOn(null);
          }
        },
      },
    ]);
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (requests === null) return <LoadingView />;

  return (
    <Screen>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.md }}>
            <Text style={[typography.subtitle, { color: colors.ink }]}>{strings.service[item.serviceType]}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xs }}>
              <CalendarDays size={13} color={colors.inkFaint} strokeWidth={2.25} />
              <Text style={[typography.caption, { color: colors.inkFaint, marginLeft: 4 }]}>
                {formatDateIt(item.startDate)}
                {item.endDate ? ` → ${formatDateIt(item.endDate)}` : ""}
              </Text>
            </View>
            <Text style={[typography.subtitle, { color: colors.accent, marginTop: spacing.sm, marginBottom: spacing.md }]}>
              {item.sitterPayout.toFixed(2)}€ a te
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={strings.booking.decline}
                  onPress={() => handleDecline(item.id)}
                  variant="secondary"
                  loading={actingOn === item.id}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button label={strings.booking.accept} onPress={() => handleAccept(item.id)} loading={actingOn === item.id} />
              </View>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: spacing.xl }}>
            <Inbox size={32} color={colors.inkFaint} strokeWidth={1.5} />
            <Text style={[typography.body, { color: colors.inkFaint, marginTop: spacing.sm, textAlign: "center" }]}>
              {strings.sitterDashboard.requestsEmpty}
            </Text>
          </View>
        }
      />
    </Screen>
  );
}
