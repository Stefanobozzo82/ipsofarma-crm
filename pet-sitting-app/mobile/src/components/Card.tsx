import type { PropsWithChildren } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "@/theme/use-theme";

interface CardProps extends PropsWithChildren {
  onPress?: () => void;
  style?: ViewStyle;
}

export function Card({ children, onPress, style }: CardProps) {
  const { colors, spacing, radius } = useTheme();
  const cardStyle = [
    styles.base,
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
