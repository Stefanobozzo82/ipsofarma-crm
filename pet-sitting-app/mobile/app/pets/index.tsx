import { PetSpecies, type Pet } from "@fido/shared";
import { useEffect, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorView } from "@/components/ErrorView";
import { LoadingView } from "@/components/LoadingView";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { createPet, listMyPets } from "@/features/pets/api";
import { strings } from "@/i18n/strings";
import { useTheme } from "@/theme/use-theme";

const SPECIES_OPTIONS = Object.values(PetSpecies);

export default function PetsScreen() {
  const { colors, spacing, radius, typography } = useTheme();

  const [pets, setPets] = useState<Pet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [species, setSpecies] = useState<PetSpecies>(PetSpecies.Dog);
  const [behavioralNotes, setBehavioralNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function load() {
    listMyPets()
      .then(setPets)
      .catch(() => setError(strings.common.genericError));
  }

  useEffect(load, []);

  async function handleAdd() {
    setSubmitting(true);
    try {
      await createPet({ name: name.trim(), species, behavioralNotes: behavioralNotes.trim() || undefined });
      setName("");
      setBehavioralNotes("");
      setSpecies(PetSpecies.Dog);
      setShowForm(false);
      load();
    } catch {
      Alert.alert(strings.common.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (pets === null) return <LoadingView />;

  return (
    <Screen>
      <Text style={[typography.display, { color: colors.ink, marginBottom: spacing.lg }]}>{strings.pets.title}</Text>

      <FlatList
        data={pets}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm }}>
            <Text style={[typography.subtitle, { color: colors.ink }]}>{item.name}</Text>
            <Text style={[typography.caption, { color: colors.inkFaint }]}>{strings.petSpecies[item.species]}</Text>
          </Card>
        )}
        ListEmptyComponent={
          <Text style={[typography.body, { color: colors.inkFaint, marginBottom: spacing.lg }]}>{strings.pets.empty}</Text>
        }
      />

      {showForm ? (
        <View style={{ marginTop: spacing.md }}>
          <TextField label={strings.pets.name} value={name} onChangeText={setName} />

          <Text style={[typography.label, { color: colors.inkFaint, marginBottom: spacing.sm }]}>{strings.pets.species}</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg }}>
            {SPECIES_OPTIONS.map((s) => {
              const selected = s === species;
              return (
                <Pressable
                  key={s}
                  onPress={() => setSpecies(s)}
                  style={{
                    backgroundColor: selected ? colors.accent : colors.surface,
                    borderColor: selected ? colors.accent : colors.line,
                    borderWidth: 1,
                    borderRadius: radius.pill,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  }}
                >
                  <Text style={{ color: selected ? colors.accentInk : colors.ink }}>{strings.petSpecies[s]}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextField
            label={strings.pets.behavioralNotes}
            value={behavioralNotes}
            onChangeText={setBehavioralNotes}
            multiline
          />

          <Button label={strings.common.save} onPress={handleAdd} loading={submitting} disabled={!name.trim()} />
        </View>
      ) : (
        <Button label={strings.pets.addCta} onPress={() => setShowForm(true)} variant="secondary" />
      )}
    </Screen>
  );
}
