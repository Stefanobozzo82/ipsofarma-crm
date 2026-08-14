import { Link, router } from "expo-router";
import { useState } from "react";
import { Switch, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { strings } from "@/i18n/strings";
import { useAuthStore } from "@/store/auth-store";
import { useTheme } from "@/theme/use-theme";

export default function SignupScreen() {
  const { colors, spacing, typography } = useTheme();
  const signUp = useAuthStore((s) => s.signUp);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gdprConsent, setGdprConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const canSubmit = firstName && lastName && email && password.length >= 8 && gdprConsent;

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const hasSession = await signUp({ email: email.trim(), password, firstName, lastName, gdprConsent });
      if (hasSession) {
        router.replace("/(tabs)");
      } else {
        setAwaitingConfirmation(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.common.genericError);
    } finally {
      setLoading(false);
    }
  }

  if (awaitingConfirmation) {
    return (
      <Screen>
        <Text style={[typography.title, { color: colors.ink, marginBottom: spacing.sm }]}>Controlla la tua email</Text>
        <Text style={[typography.body, { color: colors.inkMuted }]}>
          Ti abbiamo inviato un link di conferma a {email}. Confermalo per accedere.
        </Text>
        <View style={{ marginTop: spacing.xl }}>
          <Button label={strings.auth.loginCta} onPress={() => router.replace("/(auth)/login")} variant="secondary" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text style={[typography.display, { color: colors.ink, marginBottom: spacing.xs }]}>
        {strings.auth.signupTitle}
      </Text>
      <Text style={[typography.body, { color: colors.inkMuted, marginBottom: spacing.xl }]}>
        {strings.auth.signupSubtitle}
      </Text>

      <TextField label={strings.auth.firstName} value={firstName} onChangeText={setFirstName} />
      <TextField label={strings.auth.lastName} value={lastName} onChangeText={setLastName} />
      <TextField
        label={strings.auth.email}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <TextField
        label={strings.auth.password}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password-new"
      />

      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.lg }}>
        <Switch value={gdprConsent} onValueChange={setGdprConsent} trackColor={{ true: colors.accent }} />
        <Text style={[typography.body, { color: colors.inkMuted, marginLeft: spacing.sm, flex: 1 }]}>
          {strings.auth.gdprConsent}
        </Text>
      </View>

      {error ? <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text> : null}

      <Button label={strings.auth.signup} onPress={handleSubmit} loading={loading} disabled={!canSubmit} />

      <Link href="/(auth)/login" style={{ marginTop: spacing.xl, alignSelf: "center" }}>
        <Text style={[typography.body, { color: colors.inkMuted }]}>
          {strings.auth.hasAccount} <Text style={{ color: colors.accent }}>{strings.auth.loginCta}</Text>
        </Text>
      </Link>
    </Screen>
  );
}
