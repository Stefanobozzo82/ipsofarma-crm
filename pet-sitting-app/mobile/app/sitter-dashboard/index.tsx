import type { Booking } from "@fido/shared";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorView } from "@/components/ErrorView";
import { LoadingView } from "@/components/LoadingView";
import { Screen } from "@/components/Screen";
import { StatRow, StatTile } from "@/components/StatTile";
import { createStripeOnboardingLink, getPayoutSummary, type PayoutSummary } from "@/features/payouts/api";
import { listMyBookings } from "@/features/bookings/api";
import { strings } from "@/i18n/strings";
import { useAuthStore } from "@/store/auth-store";
import { useTheme } from "@/theme/use-theme";

export default function SitterDashboardScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const myId = profile?.id;
  const sitterProfile = profile?.sitterProfile;

  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [payoutSummary, setPayoutSummary] = useState<PayoutSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingStripe, setOpeningStripe] = useState(false);

  useEffect(() => {
    Promise.all([listMyBookings(), getPayoutSummary()])
      .then(([b, p]) => {
        setBookings(b);
        setPayoutSummary(p);
      })
      .catch(() => setError(strings.common.genericError));
  }, []);

  async function handleStripeOnboarding() {
    setOpeningStripe(true);
    try {
      const { url } = await createStripeOnboardingLink();
      await Linking.openURL(url);
    } catch {
      Alert.alert(strings.common.genericError);
    } finally {
      setOpeningStripe(false);
    }
  }

  if (error) return <ErrorView message={error} />;
  if (!bookings || !payoutSummary || !sitterProfile) return <LoadingView />;

  const pendingCount = bookings.filter((b) => b.sitterId === myId && b.status === "pending_request").length;
  const upcomingCount = bookings.filter(
    (b) => b.sitterId === myId && (b.status === "confirmed" || b.status === "in_progress"),
  ).length;

  return (
    <Screen scroll>
      {!payoutSummary.onboardingComplete && (
        <Card style={{ marginBottom: spacing.lg, borderColor: colors.amber, borderWidth: 1.5 }}>
          <Text style={[typography.subtitle, { color: colors.amber }]}>{strings.sitterDashboard.stripeBannerTitle}</Text>
          <Text style={[typography.body, { color: colors.inkMuted, marginTop: spacing.xs, marginBottom: spacing.md }]}>
            {strings.sitterDashboard.stripeBannerBody}
          </Text>
          <Button label={strings.sitterDashboard.stripeBannerCta} onPress={handleStripeOnboarding} loading={openingStripe} />
        </Card>
      )}

      <StatRow>
        <StatTile label={strings.sitterDashboard.rating} value={sitterProfile.averageRating?.toFixed(1) ?? "–"} />
        <StatTile label={strings.sitterDashboard.reviews} value={String(sitterProfile.reviewCount)} />
      </StatRow>

      <DashboardLink
        title={strings.sitterDashboard.requestsTitle}
        subtitle={pendingCount > 0 ? strings.sitterDashboard.requestsCount(pendingCount) : strings.sitterDashboard.requestsEmpty}
        highlight={pendingCount > 0}
        onPress={() => router.push("/sitter-dashboard/requests")}
      />
      <DashboardLink
        title={strings.sitterDashboard.calendarTitle}
        subtitle={strings.sitterDashboard.calendarSubtitle(upcomingCount)}
        onPress={() => router.push("/sitter-dashboard/calendar")}
      />
      <DashboardLink
        title={strings.sitterDashboard.payoutsTitle}
        subtitle={
          payoutSummary.availableBalance !== null ? `${payoutSummary.availableBalance.toFixed(2)}€ disponibili` : "—"
        }
        onPress={() => router.push("/sitter-dashboard/payouts")}
      />
      <DashboardLink title={strings.sitterDashboard.servicesTitle} onPress={() => router.push("/sitter-dashboard/services")} />
      <DashboardLink
        title={strings.sitterDashboard.availabilityTitle}
        onPress={() => router.push("/sitter-dashboard/availability")}
      />
    </Screen>
  );
}

function DashboardLink({
  title,
  subtitle,
  onPress,
  highlight = false,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  highlight?: boolean;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <Card onPress={onPress} style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={[typography.subtitle, { color: colors.ink }]}>{title}</Text>
        {highlight && <View style={{ backgroundColor: colors.amber, borderRadius: radius.pill, width: 10, height: 10 }} />}
      </View>
      {subtitle ? <Text style={[typography.caption, { color: colors.inkFaint, marginTop: 2 }]}>{subtitle}</Text> : null}
    </Card>
  );
}
