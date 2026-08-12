import type { Booking } from "@fido/shared";
import { useStripe } from "@stripe/stripe-react-native";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorView } from "@/components/ErrorView";
import { LoadingView } from "@/components/LoadingView";
import { Screen } from "@/components/Screen";
import { bookingStatusTone, StatusBadge } from "@/components/StatusBadge";
import { cancelBooking, getBooking, payBooking } from "@/features/bookings/api";
import { strings } from "@/i18n/strings";
import { formatDateIt } from "@/lib/date";
import { useTheme } from "@/theme/use-theme";

const CANCELLABLE_STATUSES = ["pending_request", "confirmed"];

export default function BookingDetailScreen() {
  const { colors, spacing, typography } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(() => {
    getBooking(id)
      .then(setBooking)
      .catch(() => setError(strings.common.genericError));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!booking) return <LoadingView />;

  async function handlePay() {
    setPaying(true);
    try {
      const { clientSecret } = await payBooking(booking!.id);
      const init = await initPaymentSheet({ paymentIntentClientSecret: clientSecret, merchantDisplayName: "Fido" });
      if (init.error) throw new Error(init.error.message);

      const result = await presentPaymentSheet();
      if (result.error) {
        if (result.error.code !== "Canceled") Alert.alert(strings.common.genericError, result.error.message);
        return;
      }
      Alert.alert(strings.booking.paySuccess);
      load();
    } catch (err) {
      Alert.alert(strings.common.genericError, err instanceof Error ? err.message : undefined);
    } finally {
      setPaying(false);
    }
  }

  function handleCancel() {
    Alert.alert(strings.booking.cancelBooking, strings.booking.cancelConfirm, [
      { text: strings.common.cancel, style: "cancel" },
      {
        text: strings.booking.cancelBooking,
        style: "destructive",
        onPress: async () => {
          setCancelling(true);
          try {
            await cancelBooking(booking!.id, {});
            load();
          } catch {
            Alert.alert(strings.common.genericError);
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  }

  const canPay = booking.status === "confirmed" && booking.paymentStatus === "pending";
  const canCancel = CANCELLABLE_STATUSES.includes(booking.status);

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.lg }}>
        <Text style={[typography.display, { color: colors.ink }]}>{strings.service[booking.serviceType]}</Text>
        <StatusBadge label={strings.bookingStatus[booking.status]} tone={bookingStatusTone(booking.status)} />
      </View>

      <Card style={{ marginBottom: spacing.lg }}>
        <Row label={strings.booking.startDate} value={formatDateIt(booking.startDate)} />
        {booking.endDate ? <Row label={strings.booking.endDate} value={formatDateIt(booking.endDate)} /> : null}
        {booking.notes ? <Row label={strings.booking.notes} value={booking.notes} /> : null}
      </Card>

      <Text style={[typography.label, { color: colors.inkFaint, marginBottom: spacing.sm }]}>
        {strings.booking.priceBreakdown}
      </Text>
      <Card style={{ marginBottom: spacing.lg }}>
        <Row label={strings.booking.unitPrice} value={`${booking.unitPrice.toFixed(2)}€ ${strings.search.perUnit[booking.priceUnit]}`} />
        <Row label={strings.booking.quantity} value={String(booking.quantity)} />
        <View style={{ height: 1, backgroundColor: colors.line, marginVertical: spacing.sm }} />
        <Row label={strings.booking.total} value={`${booking.priceTotal.toFixed(2)}€`} emphasize />
      </Card>

      {booking.status === "pending_request" && (
        <Text style={[typography.caption, { color: colors.inkFaint, marginBottom: spacing.lg, textAlign: "center" }]}>
          {strings.booking.payWaiting}
        </Text>
      )}

      {canPay && <Button label={strings.booking.pay} onPress={handlePay} loading={paying} />}

      {canCancel && (
        <View style={{ marginTop: spacing.sm }}>
          <Button label={strings.booking.cancelBooking} onPress={handleCancel} variant="danger" loading={cancelling} />
        </View>
      )}
    </Screen>
  );
}

function Row({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xs }}>
      <Text style={[typography.body, { color: colors.inkFaint }]}>{label}</Text>
      <Text style={[emphasize ? typography.subtitle : typography.body, { color: emphasize ? colors.accent : colors.ink }]}>
        {value}
      </Text>
    </View>
  );
}
