import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { strings } from "@/i18n/strings";
import { useTheme } from "@/theme/use-theme";

interface ErrorViewProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorView({ message, onRetry }: ErrorViewProps) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={styles.center}>
      <Text style={[typography.body, { color: colors.ink, textAlign: "center", marginBottom: spacing.lg }]}>
        {message ?? strings.common.genericError}
      </Text>
      {onRetry ? <Button label={strings.common.retry} onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
});
