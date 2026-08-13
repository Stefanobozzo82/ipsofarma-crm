import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { useTheme } from "@/theme/use-theme";

interface ButtonProps {
  label: string;
  onPress: () => void;
  /** "secondary" ora è un bordo terracotta su fondo trasparente (azione
   * secondaria ma comunque rilevante), "text" è solo testo colorato senza
   * bordo/sfondo (azioni minori, es. "Annulla" dentro un form già chiaro
   * dal contesto) — prima esisteva solo un "secondary" pieno grigio, che
   * confondeva visivamente le azioni secondarie con quelle disabilitate. */
  variant?: "primary" | "secondary" | "text" | "danger";
  loading?: boolean;
  disabled?: boolean;
}

export function Button({ label, onPress, variant = "primary", loading = false, disabled = false }: ButtonProps) {
  const { colors, spacing, radius, typography } = useTheme();
  const isDisabled = disabled || loading;

  const variants = {
    primary: { bg: colors.accent, border: colors.accent, fg: colors.accentInk },
    secondary: { bg: "transparent", border: colors.accent, fg: colors.accent },
    text: { bg: "transparent", border: "transparent", fg: colors.accent },
    danger: { bg: colors.danger, border: colors.danger, fg: "#FFFFFF" },
  };
  const { bg, border, fg } = variants[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === "secondary" ? 1.5 : 0,
          borderRadius: radius.md,
          paddingVertical: variant === "text" ? spacing.sm : spacing.md,
          opacity: isDisabled ? 0.5 : 1,
          // Leggera scala al tocco invece del solo cambio opacità: la
          // micro-interazione richiesta dal design system, senza librerie
          // di animazione aggiuntive — Pressable la gestisce nativamente.
          transform: [{ scale: pressed && !isDisabled ? 0.97 : 1 }],
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[variant === "text" ? typography.bodyStrong : typography.subtitle, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
});
