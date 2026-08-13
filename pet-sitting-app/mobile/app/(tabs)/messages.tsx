import { router } from "expo-router";
import { MessagesSquare } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, Image, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { ErrorView } from "@/components/ErrorView";
import { LoadingView } from "@/components/LoadingView";
import { Screen } from "@/components/Screen";
import { listMyConversations, type ConversationWithPartner } from "@/features/chat/api";
import { strings } from "@/i18n/strings";
import { useAuthStore } from "@/store/auth-store";
import { useTheme } from "@/theme/use-theme";

/** Stessa logica foto-o-iniziale di SitterAvatar/SitterHeroAvatar (Fase 3a/
 * 3b): un contatto senza foto resta comunque "vivo", non un placeholder
 * grigio anonimo — non condivisa in un componente comune perché qui la
 * dimensione (44px, lista compatta) è diversa da entrambi i casi esistenti. */
function PartnerAvatar({ conversation }: { conversation: ConversationWithPartner }) {
  const { colors, radius, typography } = useTheme();

  if (conversation.partnerAvatarUrl) {
    return (
      <Image
        source={{ uri: conversation.partnerAvatarUrl }}
        style={{ width: 44, height: 44, borderRadius: radius.pill }}
      />
    );
  }

  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: radius.pill,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={[typography.title, { color: colors.accentInk }]}>
        {conversation.partnerName.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

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
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <PartnerAvatar conversation={item} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={[typography.subtitle, { color: colors.ink }]}>{item.partnerName}</Text>
              </View>
              {item.lastMessageAt && (
                <Text style={[typography.caption, { color: colors.inkFaint }]}>
                  {new Date(item.lastMessageAt).toLocaleDateString("it-IT")}
                </Text>
              )}
            </View>
          </Card>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: spacing.xl }}>
            <MessagesSquare size={32} color={colors.inkFaint} strokeWidth={1.5} />
            <Text style={[typography.body, { color: colors.inkFaint, marginTop: spacing.sm, textAlign: "center" }]}>
              {strings.chat.empty}
            </Text>
          </View>
        }
      />
    </Screen>
  );
}
