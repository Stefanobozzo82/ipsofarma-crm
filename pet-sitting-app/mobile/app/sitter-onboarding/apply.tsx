import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { applyAsSitter } from "@/features/sitters/api";
import { strings } from "@/i18n/strings";
import { getCurrentCoords } from "@/lib/location";
import { useAuthStore } from "@/store/auth-store";
import { useTheme } from "@/theme/use-theme";

export default function SitterApplyScreen() {
  const { colors, spacing, typography } = useTheme();
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const [bio, setBio] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [address, setAddress] = useState("");
  const [serviceRadiusKm, setServiceRadiusKm] = useState("10");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit = bio.trim().length >= 20 && address.trim().length >= 3 && experienceYears !== "";

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const coords = await getCurrentCoords();
      await applyAsSitter({
        bio: bio.trim(),
        experienceYears: Number(experienceYears) || 0,
        address: address.trim(),
        latitude: coords.latitude,
        longitude: coords.longitude,
        serviceRadiusKm: Number(serviceRadiusKm) || 10,
      });
      await refreshProfile();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.common.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Screen>
        <Text style={[typography.title, { color: colors.ink, marginBottom: spacing.sm }]}>
          {strings.sitterOnboarding.submitted}
        </Text>
        <View style={{ marginTop: spacing.lg }}>
          <Button label={strings.common.continue} onPress={() => router.replace("/(tabs)/profile")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text style={[typography.display, { color: colors.ink, marginBottom: spacing.xs }]}>
        {strings.sitterOnboarding.title}
      </Text>
      <Text style={[typography.body, { color: colors.inkMuted, marginBottom: spacing.xl }]}>
        {strings.sitterOnboarding.subtitle}
      </Text>

      <TextField label={strings.sitterOnboarding.bio} value={bio} onChangeText={setBio} multiline numberOfLines={4} />
      <TextField
        label={strings.sitterOnboarding.experienceYears}
        value={experienceYears}
        onChangeText={setExperienceYears}
        keyboardType="number-pad"
      />
      <TextField label={strings.sitterOnboarding.address} value={address} onChangeText={setAddress} />
      <TextField
        label={strings.sitterOnboarding.serviceRadiusKm}
        value={serviceRadiusKm}
        onChangeText={setServiceRadiusKm}
        keyboardType="number-pad"
      />

      {error ? <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text> : null}

      <Button label={strings.sitterOnboarding.submit} onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
    </Screen>
  );
}
