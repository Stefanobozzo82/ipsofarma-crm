import { router } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { ErrorView } from "@/components/ErrorView";
import { LoadingView } from "@/components/LoadingView";
import { Screen } from "@/components/Screen";
import { listMyConversations, type ConversationWithPartner } from "@/features/chat/api";
import { strings } from "@/i18n/strings";
import { useAuthStore } from "@/store/auth-store";
import { useTheme } from "@/theme/use-theme";

export default function MessagesScreen() {
  const { colors, spacing, typography } = useTheme();
  const myId = useAuthStore((s) => s.profile?.id);

  const [conversations, setConversations] = useState<ConversationWithPartner[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!myId) return;
    listMyConversations(myId)
      .then(setConversations)
      .catch(() => setError(strings.common.genericError));
  }

  useEffect(load, [myId]);

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (conversations === null) return <LoadingView />;

  return (
    <Screen>
      <Text style={[typography.display, { color: colors.ink, marginBottom: spacing.lg }]}>{strings.chat.tabTitle}</Text>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/chat/${item.id}`)} style={{ marginBottom: spacing.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[typography.subtitle, { color: colors.ink }]}>{item.partnerName}</Text>
              {item.lastMessageAt && (
                <Text style={[typography.caption, { color: colors.inkFaint }]}>
                  {new Date(item.lastMessageAt).toLocaleDateString("it-IT")}
                </Text>
              )}
            </View>
          </Card>
        )}
        ListEmptyComponent={
          <Text style={[typography.body, { color: colors.inkFaint, marginTop: spacing.xl, textAlign: "center" }]}>
            {strings.chat.empty}
          </Text>
        }
      />
    </Screen>
  );
}
