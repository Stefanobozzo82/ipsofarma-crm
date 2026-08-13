import type { SitterSearchResult } from "@fido/shared";
import { Image, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { StarRating } from "@/components/StarRating";
import { strings } from "@/i18n/strings";
import { useTheme } from "@/theme/use-theme";

interface SitterCardProps {
  sitter: SitterSearchResult;
  onPress: () => void;
}

/** Le foto sono il primo criterio di fiducia in un marketplace pet-care —
 * vedi il design system del redesign (mobile/README.md). Senza una foto
 * reale (demo, o sitter che non l'ha ancora caricata), l'iniziale su
 * sfondo sfumato terracotta→miele resta comunque un elemento "vivo" invece
 * di un placeholder grigio anonimo. */
function SitterAvatar({ sitter }: { sitter: SitterSearchResult }) {
  const { colors, radius, typography } = useTheme();

  if (sitter.avatarUrl) {
    return <Image source={{ uri: sitter.avatarUrl }} style={[styles.avatar, { borderRadius: radius.pill }]} />;
  }

  return (
    <View
      style={[
        styles.avatar,
        styles.avatarFallback,
        { borderRadius: radius.pill, backgroundColor: colors.accent },
      ]}
    >
      <Text style={[typography.title, { color: colors.accentInk }]}>{sitter.firstName.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export function SitterCard({ sitter, onPress }: SitterCardProps) {
  const { colors, spacing, typography } = useTheme();
  const priceUnitLabel = strings.search.perUnit[sitter.priceUnit] ?? "";

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.row}>
        <SitterAvatar sitter={sitter} />

        <View style={[styles.flex, { marginLeft: spacing.md }]}>
          <View style={styles.row}>
            <Text style={[typography.subtitle, { color: colors.ink, flex: 1 }]} numberOfLines={1}>
              {sitter.firstName}
            </Text>
            <View style={styles.priceBlock}>
              <Text style={[typography.subtitle, { color: colors.accent }]}>{sitter.price.toFixed(0)}€</Text>
              {priceUnitLabel ? (
                <Text style={[typography.caption, { color: colors.inkFaint, fontSize: 10 }]}>{priceUnitLabel}</Text>
              ) : null}
            </View>
          </View>

          <Text style={[typography.caption, { color: colors.inkFaint, marginTop: 2 }]}>
            {sitter.city ?? ""} · {strings.search.distanceKm(sitter.distanceKm)}
          </Text>

          {sitter.reviewCount > 0 ? (
            <View style={[styles.row, { marginTop: 4 }]}>
              <StarRating value={Math.round(sitter.averageRating ?? 0)} size={13} />
              <Text style={[typography.caption, { color: colors.inkFaint, marginLeft: spacing.xs }]}>
                {sitter.averageRating?.toFixed(1)} · {strings.sitter.reviewsCount(sitter.reviewCount)}
              </Text>
            </View>
          ) : (
            <Text style={[typography.caption, { color: colors.inkFaint, marginTop: 4 }]}>{strings.sitter.noReviews}</Text>
          )}
        </View>
      </View>

      {sitter.bio ? (
        <Text numberOfLines={2} style={[typography.body, { color: colors.inkMuted, marginTop: spacing.sm }]}>
          {sitter.bio}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center" },
  flex: { flex: 1 },
  priceBlock: { alignItems: "flex-end" },
  avatar: { width: 52, height: 52 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
});
