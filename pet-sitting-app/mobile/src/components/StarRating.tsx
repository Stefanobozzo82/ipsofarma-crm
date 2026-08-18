import { Star } from "lucide-react-native";
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
      {stars.map((star) => {
        const filled = star <= value;
        const icon = (
          <Star size={size} color={colors.amber} fill={filled ? colors.amber : "transparent"} strokeWidth={1.75} />
        );
        return onChange ? (
          <Pressable key={star} onPress={() => onChange(star)} hitSlop={6}>
            {icon}
          </Pressable>
        ) : (
          <View key={star}>{icon}</View>
        );
      })}
    </View>
  );
}
