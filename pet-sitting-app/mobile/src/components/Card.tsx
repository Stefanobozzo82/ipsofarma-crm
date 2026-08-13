import type { PropsWithChildren } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "@/theme/use-theme";

interface CardProps extends PropsWithChildren {
  onPress?: () => void;
  style?: ViewStyle;
  /** "raised" (default) per card protagoniste in lista (profilo sitter,
   * animale): ombra più marcata. "flat" per card dentro contenuti già
   * sollevati (es. righe in un modale) dove un'altra ombra sarebbe rumore. */
  elevation?: "raised" | "flat";
}

export function Card({ children, onPress, style, elevation = "raised" }: CardProps) {
  const { colors, spacing, radius, shadow } = useTheme();
  const cardStyle = [
    styles.base,
    elevation === "raised" ? shadow.sm : undefined,
    {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radius.lg,
      padding: spacing.lg,
    },
    style,
  ];

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [...cardStyle, { opacity: pressed ? 0.85 : 1 }]}>
        {children}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  base: { borderWidth: 1 },
});
