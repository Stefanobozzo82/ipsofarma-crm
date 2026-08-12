import { Link, router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { strings } from "@/i18n/strings";
import { useAuthStore } from "@/store/auth-store";
import { useTheme } from "@/theme/use-theme";

export default function LoginScreen() {
  const { colors, spacing, typography } = useTheme();
  const signIn = useAuthStore((s) => s.signIn);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/(tabs)");
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.common.genericError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll>
      <Text style={[typography.display, { color: colors.ink, marginBottom: spacing.xs }]}>
        {strings.auth.loginTitle}
      </Text>
      <Text style={[typography.body, { color: colors.inkMuted, marginBottom: spacing.xl }]}>
        {strings.auth.loginSubtitle}
      </Text>

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
        autoComplete="password"
      />

      {error ? <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text> : null}

      <Button label={strings.auth.login} onPress={handleSubmit} loading={loading} disabled={!email || !password} />

      <Link href="/(auth)/signup" style={{ marginTop: spacing.xl, alignSelf: "center" }}>
        <Text style={[typography.body, { color: colors.inkMuted }]}>
          {strings.auth.noAccount} <Text style={{ color: colors.accent }}>{strings.auth.signupCta}</Text>
        </Text>
      </Link>
    </Screen>
  );
}
