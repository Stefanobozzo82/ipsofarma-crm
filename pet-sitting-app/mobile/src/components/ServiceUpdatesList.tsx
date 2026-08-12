import type { ServiceUpdate } from "@fido/shared";
import { Text, View } from "react-native";
import { Card } from "@/components/Card";
import { strings } from "@/i18n/strings";
import { useTheme } from "@/theme/use-theme";

export function ServiceUpdatesList({ updates }: { updates: ServiceUpdate[] }) {
  const { colors, spacing, typography } = useTheme();

  if (updates.length === 0) {
    return (
      <Text style={[typography.caption, { color: colors.inkFaint, marginBottom: spacing.lg }]}>
        {strings.tracking.noUpdates}
      </Text>
    );
  }

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={[typography.label, { color: colors.inkFaint, marginBottom: spacing.sm }]}>
        {strings.tracking.updatesTitle}
      </Text>
      {updates.map((u) => (
        <Card key={u.id} style={{ marginBottom: spacing.sm }}>
          {u.note ? <Text style={[typography.body, { color: colors.ink }]}>{u.note}</Text> : null}
          <Text style={[typography.caption, { color: colors.inkFaint, marginTop: spacing.xs }]}>
            {new Date(u.createdAt).toLocaleString("it-IT")}
          </Text>
        </Card>
      ))}
    </View>
  );
}
