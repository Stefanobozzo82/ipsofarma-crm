import type { ServiceUpdate } from "@fido/shared";
import { Inbox } from "lucide-react-native";
import { Text, View } from "react-native";
import { Card } from "@/components/Card";
import { strings } from "@/i18n/strings";
import { useTheme } from "@/theme/use-theme";

export function ServiceUpdatesList({ updates }: { updates: ServiceUpdate[] }) {
  const { colors, spacing, typography } = useTheme();

  if (updates.length === 0) {
    return (
      <View style={{ alignItems: "center", marginBottom: spacing.lg, paddingVertical: spacing.md }}>
        <Inbox size={28} color={colors.inkFaint} strokeWidth={1.5} />
        <Text style={[typography.caption, { color: colors.inkFaint, marginTop: spacing.xs }]}>
          {strings.tracking.noUpdates}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={[typography.label, { color: colors.inkFaint, marginBottom: spacing.sm }]}>
        {strings.tracking.updatesTitle}
      </Text>
      {/* Timeline con pallino + linea connettrice: la riga sinistra si
       * allunga automaticamente all'altezza della Card affiancata perché
       * flexDirection "row" ha alignItems "stretch" di default — nessuna
       * misura manuale necessaria. Comunica "sequenza di eventi durante il
       * servizio" invece di una lista di card scollegate tra loro. */}
      {updates.map((u, i) => (
        <View key={u.id} style={{ flexDirection: "row" }}>
          <View style={{ width: 20, alignItems: "center" }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: spacing.md }} />
            {i < updates.length - 1 && <View style={{ width: 1, flex: 1, backgroundColor: colors.line, marginTop: 4 }} />}
          </View>
          <Card style={{ flex: 1, marginBottom: spacing.sm }}>
            {u.note ? <Text style={[typography.body, { color: colors.ink }]}>{u.note}</Text> : null}
            <Text style={[typography.caption, { color: colors.inkFaint, marginTop: u.note ? spacing.xs : 0 }]}>
              {new Date(u.createdAt).toLocaleString("it-IT")}
            </Text>
          </Card>
        </View>
      ))}
    </View>
  );
}
