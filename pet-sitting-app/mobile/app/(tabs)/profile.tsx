import { router } from "expo-router";
import { Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { bookingStatusTone, StatusBadge } from "@/components/StatusBadge";
import { strings } from "@/i18n/strings";
import { useAuthStore } from "@/store/auth-store";
import { useTheme } from "@/theme/use-theme";

export default function ProfileScreen() {
  const { colors, spacing, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <Screen scroll>
      <Text style={[typography.display, { color: colors.ink, marginBottom: spacing.lg }]}>{strings.profile.title}</Text>

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.title, { color: colors.ink }]}>
          {profile ? `${profile.firstName} ${profile.lastName}` : "…"}
        </Text>
        <Text style={[typography.body, { color: colors.inkFaint, marginTop: spacing.xs }]}>{profile?.email}</Text>
      </Card>

      <Card onPress={() => router.push("/pets")} style={{ marginBottom: spacing.md }}>
        <Text style={[typography.subtitle, { color: colors.ink }]}>{strings.profile.myPets}</Text>
      </Card>

      {profile?.sitterProfile ? (
        <Card style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[typography.subtitle, { color: colors.ink }]}>{strings.profile.sitterStatusTitle}</Text>
            <StatusBadge
              label={strings.profile.sitterStatus[profile.sitterProfile.status]}
              tone={bookingStatusTone(profile.sitterProfile.status)}
            />
          </View>
        </Card>
      ) : (
        <Card onPress={() => router.push("/sitter-onboarding/apply")} style={{ marginBottom: spacing.md }}>
          <Text style={[typography.subtitle, { color: colors.accent }]}>{strings.profile.becomeSitter}</Text>
        </Card>
      )}

      <View style={{ marginTop: spacing.xl }}>
        <Button label={strings.auth.logout} onPress={() => signOut()} variant="secondary" />
      </View>
    </Screen>
  );
}
