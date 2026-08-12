import type { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme/use-theme";

interface ScreenProps extends PropsWithChildren {
  scroll?: boolean;
}

/** Wrapper standard per ogni schermata: safe area + sfondo dal tema +
 * padding orizzontale coerente. `scroll` va messo a true per i form. */
export function Screen({ children, scroll = false }: ScreenProps) {
  const { colors, spacing } = useTheme();
  const Container = scroll ? ScrollView : View;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <Container
        style={scroll ? undefined : styles.flex}
        contentContainerStyle={scroll ? { padding: spacing.lg, paddingBottom: spacing.xxl } : undefined}
      >
        <View style={scroll ? undefined : [styles.flex, { padding: spacing.lg }]}>{children}</View>
      </Container>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
});
