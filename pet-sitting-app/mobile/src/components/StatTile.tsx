import type { PropsWithChildren } from "react";
import { Text, View } from "react-native";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/use-theme";

interface StatTileProps {
  label: string;
  value: string;
}

export function StatTile({ label, value }: StatTileProps) {
  const { colors, spacing, typography } = useTheme();
  return (
    <Card style={{ flex: 1 }}>
      <Text style={[typography.display, { color: colors.ink }]}>{value}</Text>
      <Text style={[typography.caption, { color: colors.inkFaint, marginTop: spacing.xs }]}>{label}</Text>
    </Card>
  );
}

export function StatRow({ children }: PropsWithChildren) {
  const { spacing } = useTheme();
  return <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg }}>{children}</View>;
}
