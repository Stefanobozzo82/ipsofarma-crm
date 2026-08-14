import type { Booking } from "@fido/shared";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import {
  CalendarDays,
  ChevronRight,
  Clock,
  CreditCard,
  Inbox,
  MessageSquare,
  Star,
  Tag,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
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
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.xs }}>
            <CreditCard size={17} color={colors.amber} strokeWidth={2.25} />
            <Text style={[typography.subtitle, { color: colors.amber, marginLeft: spacing.xs }]}>
              {strings.sitterDashboard.stripeBannerTitle}
            </Text>
          </View>
          <Text style={[typography.body, { color: colors.inkMuted, marginBottom: spacing.md }]}>
            {strings.sitterDashboard.stripeBannerBody}
          </Text>
          <Button label={strings.sitterDashboard.stripeBannerCta} onPress={handleStripeOnboarding} loading={openingStripe} />
        </Card>
      )}

      <StatRow>
        <StatTile label={strings.sitterDashboard.rating} value={sitterProfile.averageRating?.toFixed(1) ?? "–"} icon={Star} />
        <StatTile label={strings.sitterDashboard.reviews} value={String(sitterProfile.reviewCount)} icon={MessageSquare} />
      </StatRow>

      <DashboardLink
        icon={Inbox}
        title={strings.sitterDashboard.requestsTitle}
        subtitle={pendingCount > 0 ? strings.sitterDashboard.requestsCount(pendingCount) : strings.sitterDashboard.requestsEmpty}
        badge={pendingCount > 0 ? pendingCount : undefined}
        onPress={() => router.push("/sitter-dashboard/requests")}
      />
      <DashboardLink
        icon={CalendarDays}
        title={strings.sitterDashboard.calendarTitle}
        subtitle={strings.sitterDashboard.calendarSubtitle(upcomingCount)}
        onPress={() => router.push("/sitter-dashboard/calendar")}
      />
      <DashboardLink
        icon={Wallet}
        title={strings.sitterDashboard.payoutsTitle}
        subtitle={
          payoutSummary.availableBalance !== null ? `${payoutSummary.availableBalance.toFixed(2)}€ disponibili` : "—"
        }
        onPress={() => router.push("/sitter-dashboard/payouts")}
      />
      <DashboardLink icon={Tag} title={strings.sitterDashboard.servicesTitle} onPress={() => router.push("/sitter-dashboard/services")} />
      <DashboardLink
        icon={Clock}
        title={strings.sitterDashboard.availabilityTitle}
        onPress={() => router.push("/sitter-dashboard/availability")}
      />
    </Screen>
  );
}

/** Da riga "titolo + puntino" a una vera riga di navigazione (icona, testo,
 * badge numerico se c'è qualcosa che richiede attenzione, freccia finale)
 * — lo stesso vocabolario di "riga cliccabile" già stabilito in Fase 3c per
 * i campi data. Il puntino ambra è diventato un badge con il numero delle
 * richieste in attesa: comunica quante, non solo che ce n'è almeno una. */
function DashboardLink({
  title,
  subtitle,
  onPress,
  icon: Icon,
  badge,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  icon: LucideIcon;
  badge?: number;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <Card onPress={onPress} style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.md,
            backgroundColor: colors.accentSoft,
            alignItems: "center",
            justifyContent: "center",
            marginRight: spacing.md,
          }}
        >
          <Icon size={19} color={colors.accent} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.subtitle, { color: colors.ink }]}>{title}</Text>
          {subtitle ? <Text style={[typography.caption, { color: colors.inkFaint, marginTop: 2 }]}>{subtitle}</Text> : null}
        </View>
        {badge ? (
          <View
            style={{
              backgroundColor: colors.amber,
              borderRadius: radius.pill,
              minWidth: 22,
              height: 22,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 6,
              marginRight: spacing.xs,
            }}
          >
            <Text style={[typography.caption, { color: colors.accentInk, fontSize: 12 }]}>{badge}</Text>
          </View>
        ) : null}
        <ChevronRight size={18} color={colors.inkFaint} strokeWidth={2} />
      </View>
    </Card>
  );
}
