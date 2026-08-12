import type { Message } from "@fido/shared";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ErrorView } from "@/components/ErrorView";
import { LoadingView } from "@/components/LoadingView";
import { TextField } from "@/components/TextField";
import { listMessages, sendMessage, subscribeToMessages } from "@/features/chat/api";
import { strings } from "@/i18n/strings";
import { useAuthStore } from "@/store/auth-store";
import { useTheme } from "@/theme/use-theme";

export default function ChatScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const { id, partnerName } = useLocalSearchParams<{ id: string; partnerName?: string }>();
  const myId = useAuthStore((s) => s.profile?.id);
  const listRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    listMessages(id)
      .then(setMessages)
      .catch(() => setError(strings.common.genericError));

    const unsubscribe = subscribeToMessages(id, (message) => {
      setMessages((prev) => (prev?.some((m) => m.id === message.id) ? prev : [...(prev ?? []), message]));
    });
    return unsubscribe;
  }, [id]);

  async function handleSend() {
    const text = body.trim();
    if (!text || !myId) return;
    setSending(true);
    setBody("");
    try {
      await sendMessage(id, myId, text);
      // Nessun append ottimistico qui: arriva già dalla sottoscrizione
      // realtime (anche per il mittente), evitando di gestire due fonti
      // di verità per lo stesso messaggio.
    } catch {
      setBody(text);
    } finally {
      setSending(false);
    }
  }

  if (error) return <ErrorView message={error} />;

  return (
    <>
      <Stack.Screen options={{ title: partnerName ?? strings.chat.tabTitle }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.bg }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        {messages === null ? (
          <LoadingView />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: spacing.lg }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const isMine = item.senderId === myId;
              return (
                <View
                  style={[
                    styles.bubble,
                    {
                      alignSelf: isMine ? "flex-end" : "flex-start",
                      backgroundColor: isMine ? colors.accent : colors.surface,
                      borderColor: colors.line,
                      borderRadius: radius.lg,
                      marginBottom: spacing.sm,
                    },
                  ]}
                >
                  <Text style={[typography.body, { color: isMine ? colors.accentInk : colors.ink }]}>{item.body}</Text>
                </View>
              );
            }}
          />
        )}

        <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.md, gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextField
              value={body}
              onChangeText={setBody}
              placeholder={strings.chat.placeholder}
              onSubmitEditing={handleSend}
              style={{ marginBottom: 0 }}
            />
          </View>
          <Pressable
            onPress={handleSend}
            disabled={sending || !body.trim()}
            style={{
              backgroundColor: colors.accent,
              borderRadius: radius.pill,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm + 4,
              opacity: sending || !body.trim() ? 0.5 : 1,
            }}
          >
            <Text style={{ color: colors.accentInk, fontWeight: "600" }}>{strings.chat.send}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
});
