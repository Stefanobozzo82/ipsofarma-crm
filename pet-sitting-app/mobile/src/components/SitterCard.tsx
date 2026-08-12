import type { SitterSearchResult } from "@fido/shared";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { strings } from "@/i18n/strings";
import { useTheme } from "@/theme/use-theme";

interface SitterCardProps {
  sitter: SitterSearchResult;
  onPress: () => void;
}

export function SitterCard({ sitter, onPress }: SitterCardProps) {
  const { colors, spacing, typography } = useTheme();

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={[typography.subtitle, { color: colors.ink }]}>{sitter.firstName}</Text>
          <Text style={[typography.caption, { color: colors.inkFaint, marginTop: 2 }]}>
            {sitter.city ?? ""} · {strings.search.distanceKm(sitter.distanceKm)}
          </Text>
        </View>
        <View style={styles.priceBlock}>
          <Text style={[typography.subtitle, { color: colors.accent }]}>
            {sitter.price.toFixed(0)}€
          </Text>
        </View>
      </View>

      {sitter.bio ? (
        <Text numberOfLines={2} style={[typography.body, { color: colors.inkMuted, marginTop: spacing.sm }]}>
          {sitter.bio}
        </Text>
      ) : null}

      <View style={[styles.row, { marginTop: spacing.sm }]}>
        <Text style={[typography.caption, { color: colors.inkFaint }]}>
          {sitter.reviewCount > 0
            ? `★ ${sitter.averageRating?.toFixed(1) ?? "–"} · ${strings.sitter.reviewsCount(sitter.reviewCount)}`
            : strings.sitter.noReviews}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "flex-start" },
  flex: { flex: 1 },
  priceBlock: { alignItems: "flex-end" },
});
