import { PriceUnit, ServiceType, type SitterService } from "@fido/shared";
import { PackageOpen, Trash2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorView } from "@/components/ErrorView";
import { LoadingView } from "@/components/LoadingView";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { listMyServices, setMyServices } from "@/features/sitters/api";
import { strings } from "@/i18n/strings";
import { useTheme } from "@/theme/use-theme";

const SERVICE_OPTIONS = Object.values(ServiceType);
const UNIT_OPTIONS = Object.values(PriceUnit);
const DURATION_UNITS: PriceUnit[] = [PriceUnit.PerWalk, PriceUnit.PerVisit];

export default function ServicesScreen() {
  const { colors, spacing, radius, typography } = useTheme();

  const [services, setServices] = useState<SitterService[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [serviceType, setServiceType] = useState<ServiceType>(ServiceType.DogWalking);
  const [price, setPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState<PriceUnit>(PriceUnit.PerWalk);
  const [maxPets, setMaxPets] = useState("1");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [isActive, setIsActive] = useState(true);

  function load() {
    listMyServices()
      .then(setServices)
      .catch(() => setError(strings.common.genericError));
  }

  useEffect(load, []);

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (services === null) return <LoadingView />;

  async function persist(next: SitterService[]) {
    setSaving(true);
    try {
      const saved = await setMyServices(
        next.map((s) => ({
          serviceType: s.serviceType,
          price: s.price,
          priceUnit: s.priceUnit,
          durationMinutes: s.durationMinutes ?? undefined,
          maxPets: s.maxPets,
          isActive: s.isActive,
        })),
      );
      setServices(saved);
    } catch (err) {
      Alert.alert(strings.common.genericError, err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  function handleUpsert() {
    const priceValue = Number(price.replace(",", "."));
    if (!priceValue || priceValue <= 0) {
      Alert.alert(strings.common.genericError, "Inserisci una tariffa valida");
      return;
    }
    const next: SitterService = {
      id: `local-${serviceType}`,
      sitterId: "",
      serviceType,
      price: priceValue,
      priceUnit,
      durationMinutes: DURATION_UNITS.includes(priceUnit) ? Number(durationMinutes) || null : null,
      maxPets: Number(maxPets) || 1,
      isActive,
    };
    persist([...(services ?? []).filter((s) => s.serviceType !== serviceType), next]);
  }

  function handleRemove(type: ServiceType) {
    persist((services ?? []).filter((s) => s.serviceType !== type));
  }

  return (
    <Screen scroll>
      {services.length === 0 ? (
        <View style={{ alignItems: "center", marginBottom: spacing.lg, paddingVertical: spacing.md }}>
          <PackageOpen size={32} color={colors.inkFaint} strokeWidth={1.5} />
          <Text style={[typography.body, { color: colors.inkMuted, marginTop: spacing.sm, textAlign: "center" }]}>
            {strings.sitterDashboard.servicesEmpty}
          </Text>
        </View>
      ) : (
        services.map((s) => (
          <Card key={s.id} style={{ marginBottom: spacing.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[typography.subtitle, { color: colors.ink }]}>{strings.service[s.serviceType]}</Text>
              <Text style={[typography.body, { color: colors.accent }]}>
                {s.price.toFixed(2)}€ {strings.search.perUnit[s.priceUnit]}
              </Text>
            </View>
            <Pressable
              onPress={() => handleRemove(s.serviceType)}
              style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.sm }}
            >
              <Trash2 size={13} color={colors.danger} strokeWidth={2.25} />
              <Text style={[typography.caption, { color: colors.danger, marginLeft: 4 }]}>
                {strings.sitterDashboard.servicesRemove}
              </Text>
            </Pressable>
          </Card>
        ))
      )}

      <Text style={[typography.label, { color: colors.inkFaint, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
        {strings.sitterDashboard.servicesAddCta}
      </Text>

      <ChipRow options={SERVICE_OPTIONS} value={serviceType} onChange={setServiceType} labels={strings.service} />

      <TextField label={strings.sitterDashboard.price} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />

      <Text style={[typography.label, { color: colors.inkFaint, marginBottom: spacing.sm }]}>
        {strings.sitterDashboard.priceUnit}
      </Text>
      <ChipRow options={UNIT_OPTIONS} value={priceUnit} onChange={setPriceUnit} labels={strings.search.perUnit} />

      <TextField
        label={strings.sitterDashboard.maxPets}
        value={maxPets}
        onChangeText={setMaxPets}
        keyboardType="number-pad"
      />

      {DURATION_UNITS.includes(priceUnit) && (
        <TextField
          label={strings.sitterDashboard.durationMinutes}
          value={durationMinutes}
          onChangeText={setDurationMinutes}
          keyboardType="number-pad"
        />
      )}

      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.lg }}>
        <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: colors.accent }} />
        <Text style={[typography.body, { color: colors.inkMuted, marginLeft: spacing.sm }]}>{strings.sitterDashboard.active}</Text>
      </View>

      <Button label={strings.common.save} onPress={handleUpsert} loading={saving} disabled={!price} />
    </Screen>
  );
}

function ChipRow<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  labels: Record<string, string>;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {options.map((opt) => {
          const selected = opt === value;
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              style={{
                backgroundColor: selected ? colors.accent : colors.surface,
                borderColor: selected ? colors.accent : colors.line,
                borderWidth: 1,
                borderRadius: radius.pill,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              }}
            >
              {/* Prima mancava lo style tipografico: le chip cadevano sul
               * font di sistema invece di Inter, unica incoerenza rimasta
               * nell'app rispetto al design system — corretto qui. */}
              <Text style={[typography.bodyStrong, { color: selected ? colors.accentInk : colors.ink, fontSize: 13 }]}>
                {labels[opt]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
