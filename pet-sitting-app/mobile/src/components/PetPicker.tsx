import type { Pet } from "@fido/shared";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { strings } from "@/i18n/strings";
import { useTheme } from "@/theme/use-theme";

interface PetPickerProps {
  pets: Pet[];
  selectedIds: string[];
  onToggle: (petId: string) => void;
}

/** Chip multi-selezione per gli animali coinvolti in una prenotazione. */
export function PetPicker({ pets, selectedIds, onToggle }: PetPickerProps) {
  const { colors, spacing, radius, typography } = useTheme();

  return (
    <View style={styles.wrap}>
      {pets.map((pet) => {
        const selected = selectedIds.includes(pet.id);
        return (
          <Pressable
            key={pet.id}
            onPress={() => onToggle(pet.id)}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? colors.accentSoft : colors.surface,
                borderColor: selected ? colors.accent : colors.line,
                borderRadius: radius.pill,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              },
            ]}
          >
            <Text style={[typography.body, { color: selected ? colors.accent : colors.ink }]}>
              {pet.name} · {strings.petSpecies[pet.species] ?? pet.species}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1 },
});
