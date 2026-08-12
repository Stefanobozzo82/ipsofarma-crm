import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme/use-theme";

export type StatusTone = "positive" | "neutral" | "negative" | "warning";

interface StatusBadgeProps {
  label: string;
  tone: StatusTone;
}

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  const { colors, spacing, radius, typography } = useTheme();

  const tones: Record<StatusTone, { bg: string; fg: string }> = {
    positive: { bg: colors.accentSoft, fg: colors.accent },
    neutral: { bg: colors.surfaceMuted, fg: colors.inkFaint },
    warning: { bg: colors.amberSoft, fg: colors.amber },
    negative: { bg: colors.dangerSoft, fg: colors.danger },
  };
  const { bg, fg } = tones[tone];

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
      ]}
    >
      <Text style={[typography.label, { color: fg, textTransform: "none" }]}>{label}</Text>
    </View>
  );
}

/** Mappa gli stati di bookings/sitter allo stesso vocabolario di colore
 * ovunque nell'app: positivo = confermato/attivo, warning = in attesa,
 * negativo = rifiutato/cancellato. */
export function bookingStatusTone(status: string): StatusTone {
  switch (status) {
    case "confirmed":
    case "in_progress":
    case "completed":
    case "approved":
    case "accepted":
      return "positive";
    case "pending_request":
    case "pending":
    case "proposed":
      return "warning";
    case "declined":
    case "cancelled_by_owner":
    case "cancelled_by_sitter":
    case "cancelled":
    case "rejected":
    case "disputed":
      return "negative";
    default:
      return "neutral";
  }
}

const styles = StyleSheet.create({
  base: { alignSelf: "flex-start" },
});
