import type { Booking } from "@fido/shared";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { bookingStatusTone, StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/Card";
import { ErrorView } from "@/components/ErrorView";
import { LoadingView } from "@/components/LoadingView";
import { Screen } from "@/components/Screen";
import { listMyBookings } from "@/features/bookings/api";
import { strings } from "@/i18n/strings";
import { useTheme } from "@/theme/use-theme";

export default function BookingsScreen() {
  const { colors, spacing, typography } = useTheme();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBookings(await listMyBookings());
    } catch {
      setError(strings.common.genericError);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (bookings === null && !error) return <LoadingView />;
  if (error) return <ErrorView message={error} onRetry={load} />;

  return (
    <Screen>
      <Text style={[typography.display, { color: colors.ink, marginBottom: spacing.lg }]}>
        {strings.bookingsTab.title}
      </Text>

      <FlatList
        data={bookings ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/booking/${item.id}`)} style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <Text style={[typography.subtitle, { color: colors.ink }]}>{strings.service[item.serviceType]}</Text>
              <StatusBadge label={strings.bookingStatus[item.status]} tone={bookingStatusTone(item.status)} />
            </View>
            <Text style={[typography.caption, { color: colors.inkFaint, marginTop: spacing.xs }]}>
              {item.startDate}
              {item.endDate ? ` → ${item.endDate}` : ""}
            </Text>
            <Text style={[typography.body, { color: colors.accent, marginTop: spacing.sm }]}>
              {item.priceTotal.toFixed(2)}€
            </Text>
          </Card>
        )}
        ListEmptyComponent={
          <Text style={[typography.body, { color: colors.inkFaint, marginTop: spacing.xl, textAlign: "center" }]}>
            {strings.bookingsTab.empty}
          </Text>
        }
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
      />
    </Screen>
  );
}
