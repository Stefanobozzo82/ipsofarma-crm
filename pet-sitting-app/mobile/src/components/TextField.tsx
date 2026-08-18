import { useState } from "react";
import { StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";
import { useTheme } from "@/theme/use-theme";

interface TextFieldProps extends TextInputProps {
  /** Omesso (es. barra di invio chat) = niente riga di etichetta sopra il campo. */
  label?: string;
  error?: string;
}

export function TextField({ label, error, style, onFocus, onBlur, ...inputProps }: TextFieldProps) {
  const { colors, spacing, radius, typography } = useTheme();
  const [focused, setFocused] = useState(false);

  // Bordo che vira sull'accento a fuoco: prima il campo non dava alcun
  // riscontro visivo di essere attivo se non il cursore lampeggiante —
  // piccola ma reale mancanza di feedback interattivo.
  const borderColor = error ? colors.danger : focused ? colors.accent : colors.line;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      {label ? <Text style={[typography.label, { color: colors.inkFaint, marginBottom: spacing.xs }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.inkFaint}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          typography.body,
          {
            color: colors.ink,
            backgroundColor: colors.surfaceMuted,
            borderColor,
            borderWidth: focused ? 2 : 1,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: focused ? spacing.sm + 1 : spacing.sm + 2,
          },
          style,
        ]}
        {...inputProps}
      />
      {error ? <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.xs }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {},
});
