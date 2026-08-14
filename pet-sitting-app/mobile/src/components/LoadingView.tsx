import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { strings } from "@/i18n/strings";
import { useTheme } from "@/theme/use-theme";

export function LoadingView() {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} />
      <Text style={[typography.body, { color: colors.inkFaint, marginTop: spacing.sm }]}>{strings.common.loading}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
