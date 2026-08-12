import { ServiceType, type SitterSearchResult } from "@fido/shared";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { ErrorView } from "@/components/ErrorView";
import { LoadingView } from "@/components/LoadingView";
import { Screen } from "@/components/Screen";
import { SitterCard } from "@/components/SitterCard";
import { searchSitters } from "@/features/search/api";
import { strings } from "@/i18n/strings";
import { type Coords, DEFAULT_COORDS, getCurrentCoords } from "@/lib/location";
import { useTheme } from "@/theme/use-theme";

const SERVICES = Object.values(ServiceType);
const DEFAULT_RADIUS_KM = 15;

export default function SearchScreen() {
  const { colors, spacing, radius, typography } = useTheme();

  const [coords, setCoords] = useState<Coords>(DEFAULT_COORDS);
  const [service, setService] = useState<ServiceType>(ServiceType.DogWalking);
  const [results, setResults] = useState<SitterSearchResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (searchCoords: Coords, searchService: ServiceType) => {
    setLoading(true);
    setError(null);
    try {
      const data = await searchSitters({
        lat: searchCoords.latitude,
        lng: searchCoords.longitude,
        service: searchService,
        radiusKm: DEFAULT_RADIUS_KM,
      });
      setResults(data);
    } catch {
      setError(strings.common.genericError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getCurrentCoords().then((c) => {
      setCoords(c);
      runSearch(c, service);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelectService(next: ServiceType) {
    setService(next);
    runSearch(coords, next);
  }

  return (
    <Screen>
      <Text style={[typography.display, { color: colors.ink }]}>{strings.search.title}</Text>
      <Text style={[typography.body, { color: colors.inkMuted, marginBottom: spacing.lg }]}>
        {strings.search.subtitle}
      </Text>

      <View style={styles.chipsRow}>
        {SERVICES.map((s) => {
          const selected = s === service;
          return (
            <Pressable
              key={s}
              onPress={() => handleSelectService(s)}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? colors.accent : colors.surface,
                  borderColor: selected ? colors.accent : colors.line,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                },
              ]}
            >
              <Text style={[typography.caption, { color: selected ? colors.accentInk : colors.ink }]}>
                {strings.service[s]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <LoadingView />
      ) : error ? (
        <ErrorView message={error} onRetry={() => runSearch(coords, service)} />
      ) : (
        <FlatList
          data={results ?? []}
          keyExtractor={(item) => item.sitterId}
          renderItem={({ item }) => (
            <SitterCard sitter={item} onPress={() => router.push(`/sitter/${item.sitterId}?service=${service}`)} />
          )}
          ListEmptyComponent={
            <Text style={[typography.body, { color: colors.inkFaint, marginTop: spacing.xl, textAlign: "center" }]}>
              {strings.search.noResults}
            </Text>
          }
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: spacing.xxl }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: { borderWidth: 1 },
});
