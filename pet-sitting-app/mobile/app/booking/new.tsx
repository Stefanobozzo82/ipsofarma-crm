import { PriceUnit, type Pet, type PublicSitterProfile } from "@fido/shared";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Button } from "@/components/Button";
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

      {pets.length === 0 ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.body, { color: colors.inkMuted, marginBottom: spacing.md }]}>
            {strings.pets.empty}
          </Text>
          <Button label={strings.pets.addCta} onPress={() => router.push("/pets")} variant="secondary" />
        </View>
      ) : (
        <View style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.label, { color: colors.inkFaint, marginBottom: spacing.sm }]}>
            {strings.booking.selectPets}
          </Text>
          <PetPicker pets={pets} selectedIds={selectedPetIds} onToggle={togglePet} />
        </View>
      )}

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

      <TextField label={strings.booking.notes} value={notes} onChangeText={setNotes} multiline />

      <Button label={strings.booking.submit} onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
    </Screen>
  );
}

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
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={[typography.label, { color: colors.inkFaint, marginBottom: spacing.xs }]}>{label}</Text>
      <Pressable
        onPress={onPress}
        style={{
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 4,
          backgroundColor: colors.surface,
        }}
      >
        <Text style={[typography.body, { color: value ? colors.ink : colors.inkFaint }]}>
          {value ? (isTime ? toTimeString(value) : formatDateIt(toDateString(value))) : "Seleziona"}
        </Text>
      </Pressable>
    </View>
  );
}
