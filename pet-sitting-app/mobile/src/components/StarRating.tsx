import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { useTheme } from "@/theme/use-theme";

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
}

/** Interattivo se onChange è passato (form recensione), altrimenti
 * sola-lettura (lista recensioni, riepiloghi). */
export function StarRating({ value, onChange, size = 20 }: StarRatingProps) {
  const { colors, spacing } = useTheme();
  const stars = [1, 2, 3, 4, 5];

  return (
    <View style={{ flexDirection: "row", gap: spacing.xs }}>
      {stars.map((star) =>
        onChange ? (
          <Pressable key={star} onPress={() => onChange(star)} hitSlop={6}>
            <Ionicons name={star <= value ? "star" : "star-outline"} size={size} color={colors.amber} />
          </Pressable>
        ) : (
          <Ionicons key={star} name={star <= value ? "star" : "star-outline"} size={size} color={colors.amber} />
        ),
      )}
    </View>
  );
}
