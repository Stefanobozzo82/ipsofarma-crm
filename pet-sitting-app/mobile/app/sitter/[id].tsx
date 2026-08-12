import { CANCELLATION_RULES, type PublicSitterProfile, type Review } from "@fido/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
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
      <Text style={[typography.display, { color: colors.ink }]}>{profile.firstName}</Text>
      <Text style={[typography.body, { color: colors.inkFaint, marginBottom: spacing.lg }]}>
        {profile.city ?? ""} · {profile.experienceYears ?? 0} anni di esperienza ·{" "}
        {profile.reviewCount > 0
          ? `★ ${profile.averageRating?.toFixed(1) ?? "–"} (${strings.sitter.reviewsCount(profile.reviewCount)})`
          : strings.sitter.noReviews}
      </Text>

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
