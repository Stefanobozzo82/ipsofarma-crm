import type { Booking, ServiceUpdate } from "@fido/shared";
import { useStripe } from "@stripe/stripe-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorView } from "@/components/ErrorView";
import { LoadingView } from "@/components/LoadingView";
import { Screen } from "@/components/Screen";
import { ServiceTrackingPanel } from "@/components/ServiceTrackingPanel";
import { ServiceUpdatesList } from "@/components/ServiceUpdatesList";
import { StarRating } from "@/components/StarRating";
import { bookingStatusTone, StatusBadge } from "@/components/StatusBadge";
import { TextField } from "@/components/TextField";
import { ApiError } from "@/lib/api";
import { cancelBooking, completeBooking, getBooking, payBooking, startBooking } from "@/features/bookings/api";
import { getOrCreateConversation } from "@/features/chat/api";
import { createReview } from "@/features/reviews/api";
import { listServiceUpdates } from "@/features/tracking/api";
import { strings } from "@/i18n/strings";
import { formatDateIt } from "@/lib/date";
import { useAuthStore } from "@/store/auth-store";
import { useTheme } from "@/theme/use-theme";

const CANCELLABLE_STATUSES = ["pending_request", "confirmed"];

export default function BookingDetailScreen() {
  const { colors, spacing, typography } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const myId = useAuthStore((s) => s.profile?.id);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [updates, setUpdates] = useState<ServiceUpdate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const load = useCallback(() => {
    getBooking(id)
      .then(setBooking)
      .catch(() => setError(strings.common.genericError));
  }, [id]);

  const loadUpdates = useCallback(() => {
    listServiceUpdates(id).then(setUpdates).catch(() => {});
  }, [id]);

  useEffect(() => {
    load();
    loadUpdates();
  }, [load, loadUpdates]);

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

  async function handleStart() {
    setTransitioning(true);
    try {
      await startBooking(booking!.id);
      load();
    } catch {
      Alert.alert(strings.common.genericError);
    } finally {
      setTransitioning(false);
    }
  }

  async function handleComplete() {
    setTransitioning(true);
    try {
      await completeBooking(booking!.id);
      load();
    } catch {
      Alert.alert(strings.common.genericError);
    } finally {
      setTransitioning(false);
    }
  }

  async function handleSubmitReview() {
    setSubmittingReview(true);
    try {
      await createReview(booking!.id, { rating, comment: comment.trim() || undefined });
      setReviewSubmitted(true);
      setShowReviewForm(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "conflict") {
        Alert.alert(strings.review.alreadyReviewed);
        setReviewSubmitted(true);
        setShowReviewForm(false);
      } else {
        Alert.alert(strings.common.genericError);
      }
    } finally {
      setSubmittingReview(false);
    }
  }

  async function handleContact() {
    if (!myId) return;
    setOpeningChat(true);
    try {
      const conversation = await getOrCreateConversation(booking!.ownerId, booking!.sitterId);
      router.push(`/chat/${conversation.id}`);
    } catch {
      Alert.alert(strings.common.genericError);
    } finally {
      setOpeningChat(false);
    }
  }

  const isSitter = booking.sitterId === myId;
  const canPay = booking.status === "confirmed" && booking.paymentStatus === "pending";
  const canCancel = CANCELLABLE_STATUSES.includes(booking.status);
  const canStart = isSitter && booking.status === "confirmed" && booking.paymentStatus === "captured";
  const canComplete = isSitter && booking.status === "in_progress";
  const canReview = booking.status === "completed" && !reviewSubmitted;

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
        <Row
          label={strings.booking.total}
          value={`${(isSitter ? booking.sitterPayout : booking.priceTotal).toFixed(2)}€`}
          emphasize
        />
      </Card>

      {booking.status === "pending_request" && !isSitter && (
        <Text style={[typography.caption, { color: colors.inkFaint, marginBottom: spacing.lg, textAlign: "center" }]}>
          {strings.booking.payWaiting}
        </Text>
      )}

      {isSitter && booking.status === "in_progress" && (
        <ServiceTrackingPanel bookingId={booking.id} serviceType={booking.serviceType} onUpdateSent={loadUpdates} />
      )}

      {(["in_progress", "completed"].includes(booking.status) || updates.length > 0) && (
        <ServiceUpdatesList updates={updates} />
      )}

      <Button label={strings.chat.contact} onPress={handleContact} variant="secondary" loading={openingChat} />
      <View style={{ marginTop: spacing.sm }}>
        {canPay && <Button label={strings.booking.pay} onPress={handlePay} loading={paying} />}
        {canStart && <Button label={strings.booking.start} onPress={handleStart} loading={transitioning} />}
        {canComplete && <Button label={strings.booking.complete} onPress={handleComplete} loading={transitioning} />}
      </View>

      {canCancel && (
        <View style={{ marginTop: spacing.sm }}>
          <Button label={strings.booking.cancelBooking} onPress={handleCancel} variant="danger" loading={cancelling} />
        </View>
      )}

      {reviewSubmitted && (
        <Text style={[typography.body, { color: colors.accent, textAlign: "center", marginTop: spacing.lg }]}>
          {strings.review.thanks}
        </Text>
      )}

      {canReview && !showReviewForm && (
        <View style={{ marginTop: spacing.sm }}>
          <Button label={strings.review.leaveReview} onPress={() => setShowReviewForm(true)} variant="secondary" />
        </View>
      )}

      {canReview && showReviewForm && (
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={[typography.label, { color: colors.inkFaint, marginBottom: spacing.sm }]}>{strings.review.rating}</Text>
          <View style={{ marginBottom: spacing.md }}>
            <StarRating value={rating} onChange={setRating} size={28} />
          </View>
          <TextField label={strings.review.comment} value={comment} onChangeText={setComment} multiline />
          <Button
            label={strings.review.submit}
            onPress={handleSubmitReview}
            loading={submittingReview}
            disabled={rating === 0}
          />
        </Card>
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
