import { StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";
import { useTheme } from "@/theme/use-theme";

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function TextField({ label, error, style, ...inputProps }: TextFieldProps) {
  const { colors, spacing, radius, typography } = useTheme();

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={[typography.label, { color: colors.inkFaint, marginBottom: spacing.xs }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.inkFaint}
        style={[
          styles.input,
          typography.body,
          {
            color: colors.ink,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.line,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm + 2,
          },
          style,
        ]}
        {...inputProps}
      />
      {error ? <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.xs }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1 },
});
