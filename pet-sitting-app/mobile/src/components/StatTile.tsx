import type { ComponentType, PropsWithChildren } from "react";
import { Text, View } from "react-native";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/use-theme";

interface StatTileProps {
  label: string;
  value: string;
  /** Icona opzionale in un chip circolare sopra il numero — lo stesso
   * linguaggio icona+chip già usato in booking/[id].tsx e nel pannello di
   * tracking (Fase 3c/3d), riusato qui per gli stat della dashboard sitter
   * invece di reinventarlo. */
  icon?: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}

export function StatTile({ label, value, icon: Icon }: StatTileProps) {
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <Card style={{ flex: 1 }}>
      {Icon ? (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: radius.sm,
            backgroundColor: colors.accentSoft,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: spacing.sm,
          }}
        >
          <Icon size={16} color={colors.accent} strokeWidth={2} />
        </View>
      ) : null}
      <Text style={[typography.display, { color: colors.ink }]}>{value}</Text>
      <Text style={[typography.caption, { color: colors.inkFaint, marginTop: spacing.xs }]}>{label}</Text>
    </Card>
  );
}

export function StatRow({ children }: PropsWithChildren) {
  const { spacing } = useTheme();
  return <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg }}>{children}</View>;
}
