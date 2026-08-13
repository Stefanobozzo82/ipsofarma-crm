import { useColorScheme } from "react-native";
import { palettes } from "./colors";
import { radius, shadow, spacing, typography } from "./tokens";

export function useTheme() {
  const scheme = useColorScheme();
  const colors = palettes[scheme === "dark" ? "dark" : "light"];
  return { colors, spacing, radius, shadow, typography, scheme: scheme ?? "light" };
}
