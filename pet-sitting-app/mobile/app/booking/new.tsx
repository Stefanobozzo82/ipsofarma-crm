import { PriceUnit, type Pet, type PublicSitterProfile } from "@fido/shared";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { CalendarDays, ChevronRight, Clock, PawPrint } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorView } from "@/components/ErrorView";
import { LoadingView } from "@/components/LoadingView";
import { PetPicker } from "@/components/PetPicker";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { createBooking } from "@/features/bookings/api";
import { listMyPets } from "@/features/pets/api";
import { getPublicSitterProfile } from "@/features/sitters/api";
import { strings } from "@/i18n/strings";
import { formatDateIt, toDateString, toTimeString } from "@/lib/date";
import { useTheme } from "@/theme/use-theme";

const NEEDS_END_DATE: PriceUnit[] = [PriceUnit.PerNight];
const OPTIONAL_END_DATE: PriceUnit[] = [PriceUnit.PerDay];
const NEEDS_TIME_RANGE: PriceUnit[] = [PriceUnit.PerHour];

export default function NewBookingScreen() {
  const { colors, spacing, typography } = useTheme();
  const { sitterId, service } = useLocalSearchParams<{ sitterId: string; service: string }>();

  const [pets, setPets] = useState<Pet[] | null>(null);
  const [sitterProfile, setSitterProfile] = useState<PublicSitterProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date(Date.now() + 60 * 60 * 1000));
  const [notes, setNotes] = useState("");
  const [showPicker, setShowPicker] = useState<"start" | "end" | "startTime" | "endTime" | null>(null);

  useEffect(() => {
    Promise.all([listMyPets(), getPublicSitterProfile(sitterId)])
      .then(([petsData, profile]) => {
        setPets(petsData);
        setSitterProfile(profile);
      })
      .catch(() => setError(strings.common.genericError));
  }, [sitterId]);

  if (error) return <ErrorView message={error} />;
  if (!pets || !sitterProfile) return <LoadingView />;

  const selectedService = sitterProfile.services.find((s) => s.serviceType === service);
  if (!selectedService) return <ErrorView message="Servizio non più disponibile per questo sitter" />;

  const priceUnit = selectedService.priceUnit;
  const showEndDate = NEEDS_END_DATE.includes(priceUnit) || OPTIONAL_END_DATE.includes(priceUnit);
  const endDateRequired = NEEDS_END_DATE.includes(priceUnit);
  const showTimeRange = NEEDS_TIME_RANGE.includes(priceUnit);

  function togglePet(petId: string) {
    setSelectedPetIds((prev) => (prev.includes(petId) ? prev.filter((id) => id !== petId) : [...prev, petId]));
  }

  const canSubmit =
    selectedPetIds.length > 0 && (!endDateRequired || endDate !== null) && pets !== null && pets.length > 0;

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const booking = await createBooking({
        sitterId,
        // selectedService è garantito non-null dal guard sopra (TS non
        // propaga la narrowing dentro funzioni annidate come handleSubmit).
        serviceType: selectedService!.serviceType,
        petIds: selectedPetIds,
        startDate: toDateString(startDate),
        endDate: showEndDate && endDate ? toDateString(endDate) : undefined,
        startTime: showTimeRange ? toTimeString(startTime) : undefined,
        endTime: showTimeRange ? toTimeString(endTime) : undefined,
        notes: notes.trim() || undefined,
      });
      router.replace(`/booking/${booking.id}`);
    } catch (err) {
      Alert.alert(strings.common.genericError, err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen scroll>
      <Text style={[typography.display, { color: colors.ink, marginBottom: spacing.lg }]}>
        {strings.booking.newTitle}
      </Text>

      {/* Riepilogo servizio/sitter in cima: il brief chiede che il flusso di
       * prenotazione sia "il più semplice e rassicurante possibile" — sapere
       * subito con chi e a quale tariffa si sta prenotando, prima ancora di
       * compilare il resto, va in quella direzione. */}
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={[
              styles.serviceIcon,
              { borderRadius: 12, backgroundColor: colors.accentSoft, marginRight: spacing.md },
            ]}
          >
            <PawPrint size={20} color={colors.accent} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.label, { color: colors.inkFaint, marginBottom: 2 }]}>
              {strings.service[selectedService.serviceType]}
            </Text>
            <Text style={[typography.subtitle, { color: colors.ink }]}>
              {strings.booking.bookingWith(sitterProfile.firstName)}
            </Text>
          </View>
          <Text style={[typography.title, { color: colors.accent }]}>
            {selectedService.price.toFixed(0)}€
            <Text style={[typography.caption, { color: colors.inkFaint }]}>
              {" "}
              {strings.search.perUnit[selectedService.priceUnit]}
            </Text>
          </Text>
        </View>
      </Card>

      {pets.length === 0 ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.body, { color: colors.inkMuted, marginBottom: spacing.md }]}>
            {strings.pets.empty}
          </Text>
          <Button label={strings.pets.addCta} onPress={() => router.push("/pets")} variant="secondary" />
        </View>
      ) : (
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.label, { color: colors.inkFaint, marginBottom: spacing.sm }]}>
            {strings.booking.selectPets}
          </Text>
          <PetPicker pets={pets} selectedIds={selectedPetIds} onToggle={togglePet} />
        </Card>
      )}

      <Card style={{ marginBottom: spacing.lg }}>
        <DateField
          label={strings.booking.startDate}
          value={startDate}
          onPress={() => setShowPicker("start")}
        />
        {showEndDate && (
          <DateField
            label={strings.booking.endDate + (endDateRequired ? "" : " (opzionale)")}
            value={endDate}
            onPress={() => setShowPicker("end")}
          />
        )}
        {showTimeRange && (
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <DateField label="Dalle" value={startTime} onPress={() => setShowPicker("startTime")} isTime />
            </View>
            <View style={{ flex: 1 }}>
              <DateField label="Alle" value={endTime} onPress={() => setShowPicker("endTime")} isTime />
            </View>
          </View>
        )}
      </Card>

      {showPicker && (
        <DateTimePicker
          value={
            showPicker === "start"
              ? startDate
              : showPicker === "end"
                ? (endDate ?? startDate)
                : showPicker === "startTime"
                  ? startTime
                  : endTime
          }
          mode={showPicker === "startTime" || showPicker === "endTime" ? "time" : "date"}
          minimumDate={showPicker === "start" ? new Date() : undefined}
          display="default"
          onChange={(_event, date) => {
            const picker = showPicker;
            setShowPicker(null);
            if (!date) return;
            if (picker === "start") setStartDate(date);
            if (picker === "end") setEndDate(date);
            if (picker === "startTime") setStartTime(date);
            if (picker === "endTime") setEndTime(date);
          }}
        />
      )}

      <Card style={{ marginBottom: spacing.lg }}>
        <TextField label={strings.booking.notes} value={notes} onChangeText={setNotes} multiline />
      </Card>

      <Button label={strings.booking.submit} onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
    </Screen>
  );
}

/** Il resto del form ha già l'aspetto "cliccabile" grazie a bordo+sfondo
 * card, ma un semplice riquadro vuoto poteva ancora leggersi come testo
 * statico. Icona iniziale (tipo di dato) + chevron finale (c'è altro dietro,
 * tocca per cambiare) sono lo stesso linguaggio visivo già usato per le
 * righe interattive nel resto del redesign. */
function DateField({
  label,
  value,
  onPress,
  isTime = false,
}: {
  label: string;
  value: Date | null;
  onPress: () => void;
  isTime?: boolean;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  const Icon = isTime ? Clock : CalendarDays;
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[typography.label, { color: colors.inkFaint, marginBottom: spacing.xs }]}>{label}</Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.dateField,
          {
            borderColor: colors.line,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm + 4,
            backgroundColor: pressed ? colors.surfaceMuted : colors.bg,
          },
        ]}
      >
        <Icon size={17} color={colors.inkFaint} strokeWidth={2} />
        <Text
          style={[
            typography.body,
            { color: value ? colors.ink : colors.inkFaint, flex: 1, marginLeft: spacing.sm },
          ]}
        >
          {value ? (isTime ? toTimeString(value) : formatDateIt(toDateString(value))) : "Seleziona"}
        </Text>
        <ChevronRight size={17} color={colors.inkFaint} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  serviceIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  dateField: { flexDirection: "row", alignItems: "center", borderWidth: 1 },
});
