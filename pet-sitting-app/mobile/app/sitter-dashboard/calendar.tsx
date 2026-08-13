import type { Booking } from "@fido/shared";
import { router } from "expo-router";
import { CalendarDays, CalendarX } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { ErrorView } from "@/components/ErrorView";
import { LoadingView } from "@/components/LoadingView";
import { Screen } from "@/components/Screen";
import { bookingStatusTone, StatusBadge } from "@/components/StatusBadge";
import { listMyBookings } from "@/features/bookings/api";
import { strings } from "@/i18n/strings";
import { formatDateIt } from "@/lib/date";
import { useAuthStore } from "@/store/auth-store";
import { useTheme } from "@/theme/use-theme";

const VISIBLE_STATUSES = ["confirmed", "in_progress", "completed"];

export default function SitterCalendarScreen() {
  const { colors, spacing, typography } = useTheme();
  const myId = useAuthStore((s) => s.profile?.id);

  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    listMyBookings()
      .then((data) => {
        const mine = data
          .filter((b) => b.sitterId === myId && VISIBLE_STATUSES.includes(b.status))
          .sort((a, b) => a.startDate.localeCompare(b.startDate));
        setBookings(mine);
      })
      .catch(() => setError(strings.common.genericError));
  }

  useEffect(load, [myId]);

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (bookings === null) return <LoadingView />;

  return (
    <Screen>
      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/booking/${item.id}`)} style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <Text style={[typography.subtitle, { color: colors.ink }]}>{strings.service[item.serviceType]}</Text>
              <StatusBadge label={strings.bookingStatus[item.status]} tone={bookingStatusTone(item.status)} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xs }}>
              <CalendarDays size={13} color={colors.inkFaint} strokeWidth={2.25} />
              <Text style={[typography.caption, { color: colors.inkFaint, marginLeft: 4 }]}>
                {formatDateIt(item.startDate)}
                {item.endDate ? ` → ${formatDateIt(item.endDate)}` : ""}
              </Text>
            </View>
            <Text style={[typography.subtitle, { color: colors.accent, marginTop: spacing.sm }]}>
              {item.sitterPayout.toFixed(2)}€
            </Text>
          </Card>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: spacing.xl }}>
            <CalendarX size={32} color={colors.inkFaint} strokeWidth={1.5} />
            <Text style={[typography.body, { color: colors.inkFaint, marginTop: spacing.sm, textAlign: "center" }]}>
              {strings.sitterDashboard.calendarEmpty}
            </Text>
          </View>
        }
      />
    </Screen>
  );
}
