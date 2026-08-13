import { CANCELLATION_RULES, type PublicSitterProfile, type Review } from "@fido/shared";
import { router, useLocalSearchParams } from "expo-router";
import { BadgeCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorView } from "@/components/ErrorView";
import { LoadingView } from "@/components/LoadingView";
import { Screen } from "@/components/Screen";
import { StarRating } from "@/components/StarRating";
import { getOrCreateConversation } from "@/features/chat/api";
import { createMeetGreet } from "@/features/meet-greets/api";
import { listSitterReviews } from "@/features/reviews/api";
import { getPublicSitterProfile } from "@/features/sitters/api";
import { strings } from "@/i18n/strings";
import { useAuthStore } from "@/store/auth-store";
import { useTheme } from "@/theme/use-theme";

/** Il badge "verificato" che il brief del redesign chiede di riusare
 * identico ovunque serva — qui è il primo punto in cui compare (ogni
 * profilo pubblico appartiene per forza a un sitter già approvato, quindi
 * qui è sempre vero, non condizionale). */
function VerifiedBadge() {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={[styles.verifiedRow, { marginTop: spacing.xs }]}>
      <BadgeCheck size={15} color={colors.success} strokeWidth={2.25} />
      <Text style={[typography.caption, { color: colors.success, marginLeft: 4, fontWeight: "600" }]}>
        {strings.sitter.verifiedBadge}
      </Text>
    </View>
  );
}

function SitterHeroAvatar({ profile }: { profile: PublicSitterProfile }) {
  const { colors, radius, typography } = useTheme();

  if (profile.avatarUrl) {
    return <Image source={{ uri: profile.avatarUrl }} style={[styles.hero, { borderRadius: radius.lg }]} />;
  }

  return (
    <View style={[styles.hero, styles.heroFallback, { borderRadius: radius.lg, backgroundColor: colors.accent }]}>
      <Text style={[typography.display, { color: colors.accentInk, fontSize: 44 }]}>
        {profile.firstName.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export default function SitterProfileScreen() {
  const { colors, spacing, typography } = useTheme();
  const { id, service } = useLocalSearchParams<{ id: string; service?: string }>();
  const myId = useAuthStore((s) => s.profile?.id);

  const [profile, setProfile] = useState<PublicSitterProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [requestingMeetGreet, setRequestingMeetGreet] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  useEffect(() => {
    getPublicSitterProfile(id)
      .then(setProfile)
      .catch(() => setError(strings.common.genericError));
    listSitterReviews(id)
      .then(setReviews)
      .catch(() => {
        // Le recensioni sono un contenuto accessorio: se il caricamento
        // fallisce non blocchiamo il resto del profilo.
      });
  }, [id]);

  if (error) return <ErrorView message={error} />;
  if (!profile) return <LoadingView />;

  const preselected = profile.services.find((s) => s.serviceType === service) ?? profile.services[0];

  async function handleContact() {
    if (!myId) return;
    setOpeningChat(true);
    try {
      const conversation = await getOrCreateConversation(myId, id);
      router.push(`/chat/${conversation.id}?partnerName=${encodeURIComponent(profile!.firstName)}`);
    } catch {
      Alert.alert(strings.common.genericError);
    } finally {
      setOpeningChat(false);
    }
  }

  async function handleMeetGreet() {
    setRequestingMeetGreet(true);
    try {
      const proposed = new Date();
      proposed.setDate(proposed.getDate() + 1);
      proposed.setHours(17, 0, 0, 0);
      await createMeetGreet({ sitterId: id, proposedDatetime: proposed.toISOString() });
      Alert.alert(strings.sitter.requestMeetGreet, "Richiesta inviata! Il sitter ti risponderà a breve.");
    } catch {
      Alert.alert(strings.common.genericError);
    } finally {
      setRequestingMeetGreet(false);
    }
  }

  return (
    <Screen scroll>
      <SitterHeroAvatar profile={profile} />

      <Text style={[typography.display, { color: colors.ink, marginTop: spacing.md }]}>{profile.firstName}</Text>
      <VerifiedBadge />

      <Text style={[typography.body, { color: colors.inkMuted, marginTop: spacing.xs }]}>
        {profile.city ?? ""}
        {profile.city ? " · " : ""}
        {profile.experienceYears ?? 0} anni di esperienza
      </Text>

      <View style={[styles.verifiedRow, { marginTop: spacing.xs, marginBottom: spacing.lg }]}>
        {profile.reviewCount > 0 ? (
          <>
            <StarRating value={Math.round(profile.averageRating ?? 0)} size={16} />
            <Text style={[typography.caption, { color: colors.inkFaint, marginLeft: spacing.xs }]}>
              {profile.averageRating?.toFixed(1)} · {strings.sitter.reviewsCount(profile.reviewCount)}
            </Text>
          </>
        ) : (
          <Text style={[typography.caption, { color: colors.inkFaint }]}>{strings.sitter.noReviews}</Text>
        )}
      </View>

      {profile.bio ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.label, { color: colors.inkFaint, marginBottom: spacing.xs }]}>
            {strings.sitter.aboutTitle}
          </Text>
          <Text style={[typography.body, { color: colors.ink }]}>{profile.bio}</Text>
        </View>
      ) : null}

      <Text style={[typography.label, { color: colors.inkFaint, marginBottom: spacing.sm }]}>
        {strings.sitter.servicesTitle}
      </Text>
      {profile.services.map((s) => (
        <Card key={s.id} style={{ marginBottom: spacing.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[typography.body, { color: colors.ink }]}>{strings.service[s.serviceType]}</Text>
            <Text style={[typography.subtitle, { color: colors.accent }]}>
              {s.price.toFixed(2)}€ {strings.search.perUnit[s.priceUnit]}
            </Text>
          </View>
        </Card>
      ))}

      <View style={{ marginTop: spacing.md, marginBottom: spacing.lg }}>
        <Text style={[typography.label, { color: colors.inkFaint, marginBottom: spacing.xs }]}>
          {strings.sitter.cancellationTitle}
        </Text>
        <Text style={[typography.caption, { color: colors.inkMuted }]}>
          {CANCELLATION_RULES[profile.cancellationPolicy].labelIt}
        </Text>
      </View>

      {reviews.length > 0 && (
        <View style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.label, { color: colors.inkFaint, marginBottom: spacing.sm }]}>
            {strings.sitter.reviewsCount(reviews.length)}
          </Text>
          {reviews.map((r) => (
            <Card key={r.id} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[typography.body, { color: colors.ink }]}>{r.reviewerFirstName}</Text>
                <StarRating value={r.rating} size={14} />
              </View>
              {r.comment ? (
                <Text style={[typography.caption, { color: colors.inkMuted, marginTop: spacing.xs }]}>{r.comment}</Text>
              ) : null}
            </Card>
          ))}
        </View>
      )}

      <Button label={strings.chat.contact} onPress={handleContact} variant="secondary" loading={openingChat} />

      <View style={{ marginTop: spacing.sm }}>
        <Button
          label={strings.sitter.requestMeetGreet}
          onPress={handleMeetGreet}
          variant="secondary"
          loading={requestingMeetGreet}
        />
      </View>

      <View style={{ marginTop: spacing.sm }}>
        <Button
          label={strings.sitter.bookCta}
          onPress={() => router.push(`/booking/new?sitterId=${id}&service=${preselected?.serviceType}`)}
          disabled={!preselected}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { width: "100%", height: 220 },
  heroFallback: { alignItems: "center", justifyContent: "center" },
  verifiedRow: { flexDirection: "row", alignItems: "center" },
});
