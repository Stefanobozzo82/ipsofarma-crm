import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { useTheme } from "@/theme/use-theme";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  disabled?: boolean;
}

export function Button({ label, onPress, variant = "primary", loading = false, disabled = false }: ButtonProps) {
  const { colors, spacing, radius, typography } = useTheme();
  const isDisabled = disabled || loading;

  const backgrounds = {
    primary: colors.accent,
    secondary: colors.surfaceMuted,
    danger: colors.danger,
  };
  const textColors = {
    primary: colors.accentInk,
    secondary: colors.ink,
    danger: "#FFFFFF",
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: backgrounds[variant],
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          opacity: isDisabled ? 0.6 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColors[variant]} />
      ) : (
        <Text style={[typography.subtitle, { color: textColors[variant] }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
});
