import { Clock, Receipt, Wallet } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorView } from "@/components/ErrorView";
import { LoadingView } from "@/components/LoadingView";
import { Screen } from "@/components/Screen";
import { bookingStatusTone, StatusBadge } from "@/components/StatusBadge";
import { StatRow, StatTile } from "@/components/StatTile";
import { getPayoutSummary, requestPayout, type PayoutSummary } from "@/features/payouts/api";
import { strings } from "@/i18n/strings";
import { useTheme } from "@/theme/use-theme";

export default function PayoutsScreen() {
  const { colors, spacing, typography } = useTheme();

  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(() => {
    getPayoutSummary()
      .then(setSummary)
      .catch(() => setError(strings.common.genericError));
  }, []);

  useEffect(load, [load]);

  async function handleRequest() {
    setRequesting(true);
    try {
      await requestPayout({});
      load();
    } catch (err) {
      Alert.alert(strings.common.genericError, err instanceof Error ? err.message : undefined);
    } finally {
      setRequesting(false);
    }
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!summary) return <LoadingView />;

  const canRequest = summary.onboardingComplete && (summary.availableBalance ?? 0) > 0;

  return (
    <Screen>
      <StatRow>
        <StatTile
          label={strings.sitterDashboard.payoutsAvailable}
          value={summary.availableBalance !== null ? `${summary.availableBalance.toFixed(2)}€` : "—"}
          icon={Wallet}
        />
        <StatTile
          label={strings.sitterDashboard.payoutsPending}
          value={summary.pendingBalance !== null ? `${summary.pendingBalance.toFixed(2)}€` : "—"}
          icon={Clock}
        />
      </StatRow>

      <Button
        label={strings.sitterDashboard.payoutsRequest}
        onPress={handleRequest}
        loading={requesting}
        disabled={!canRequest}
      />

      <Text style={[typography.label, { color: colors.inkFaint, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
        {strings.sitterDashboard.payoutsHistory}
      </Text>

      <FlatList
        data={summary.history}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[typography.body, { color: colors.ink }]}>{item.amount.toFixed(2)}€</Text>
              <StatusBadge label={strings.sitterDashboard.payoutStatus[item.status]} tone={bookingStatusTone(item.status)} />
            </View>
            <Text style={[typography.caption, { color: colors.inkFaint, marginTop: 2 }]}>
              {new Date(item.requestedAt).toLocaleDateString("it-IT")}
            </Text>
          </Card>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
            <Receipt size={28} color={colors.inkFaint} strokeWidth={1.5} />
            <Text style={[typography.body, { color: colors.inkFaint, marginTop: spacing.xs }]}>
              {strings.sitterDashboard.payoutsHistoryEmpty}
            </Text>
          </View>
        }
      />
    </Screen>
  );
}
