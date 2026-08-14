import type { AvailabilityException } from "@fido/shared";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Clock } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { ErrorView } from "@/components/ErrorView";
import { LoadingView } from "@/components/LoadingView";
import { Screen } from "@/components/Screen";
import { listMyAvailability, setMyAvailability } from "@/features/sitters/api";
import { strings } from "@/i18n/strings";
import { toTimeString } from "@/lib/date";
import { useTheme } from "@/theme/use-theme";

/** Indice UI (Lunedì..Domenica, convenzione italiana) → day_of_week Postgres
 * (EXTRACT(dow): 0 = domenica … 6 = sabato) — vedi la nota sullo schema in
 * shared/src/types/sitter-service.ts. */
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0];

interface DayState {
  enabled: boolean;
  start: Date;
  end: Date;
}

function defaultDay(): DayState {
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  const end = new Date();
  end.setHours(18, 0, 0, 0);
  return { enabled: false, start, end };
}

function timeToDate(time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

export default function AvailabilityScreen() {
  const { colors, spacing, radius, typography } = useTheme();

  const [days, setDays] = useState<DayState[]>(() => DAY_VALUES.map(defaultDay));
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<{ dayIndex: number; field: "start" | "end" } | null>(null);

  useEffect(() => {
    listMyAvailability()
      .then(({ slots, exceptions: exc }) => {
        setExceptions(exc);
        setDays((prev) =>
          prev.map((day, idx) => {
            const slot = slots.find((s) => s.dayOfWeek === DAY_VALUES[idx]);
            if (!slot) return day;
            return { enabled: true, start: timeToDate(slot.startTime), end: timeToDate(slot.endTime) };
          }),
        );
        setLoaded(true);
      })
      .catch(() => setError(strings.common.genericError));
  }, []);

  if (error) return <ErrorView message={error} />;
  if (!loaded) return <LoadingView />;

  function updateDay(index: number, patch: Partial<DayState>) {
    setDays((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const slots = days.flatMap((day, idx) =>
        day.enabled
          ? [{ dayOfWeek: DAY_VALUES[idx], startTime: toTimeString(day.start), endTime: toTimeString(day.end), serviceType: null }]
          : [],
      );
      // Le eccezioni non sono modificabili da questa schermata (MVP): le
      // ripassiamo invariate per non perderle, dato che il PUT sostituisce
      // l'intero set lato backend.
      await setMyAvailability({
        slots,
        exceptions: exceptions.map((e) => ({ date: e.date, isAvailable: e.isAvailable, note: e.note ?? undefined })),
      });
      Alert.alert(strings.common.save);
    } catch (err) {
      Alert.alert(strings.common.genericError, err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <Text style={[typography.body, { color: colors.inkMuted, marginBottom: spacing.lg }]}>
        {strings.sitterDashboard.availabilitySubtitle}
      </Text>

      {strings.dayOfWeek.map((label, idx) => {
        const day = days[idx];
        return (
          <View
            key={label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: spacing.sm,
              paddingHorizontal: day.enabled ? spacing.sm : 0,
              marginHorizontal: day.enabled ? -spacing.sm : 0,
              borderRadius: radius.sm,
              backgroundColor: day.enabled ? colors.surfaceMuted : "transparent",
              borderBottomWidth: day.enabled ? 0 : 1,
              borderBottomColor: colors.line,
            }}
          >
            <Text
              style={[
                day.enabled ? typography.bodyStrong : typography.body,
                { color: day.enabled ? colors.ink : colors.inkMuted, width: 90 },
              ]}
            >
              {label}
            </Text>
            <Switch
              value={day.enabled}
              onValueChange={(v) => updateDay(idx, { enabled: v })}
              trackColor={{ true: colors.accent }}
            />
            {day.enabled && (
              <View style={{ flexDirection: "row", alignItems: "center", marginLeft: spacing.md, gap: spacing.sm, flex: 1 }}>
                <Pressable
                  onPress={() => setPicker({ dayIndex: idx, field: "start" })}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: radius.sm,
                    backgroundColor: colors.surface,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 6,
                  }}
                >
                  <Clock size={12} color={colors.inkFaint} strokeWidth={2.25} />
                  <Text style={[typography.caption, { color: colors.ink, marginLeft: 4 }]}>{toTimeString(day.start)}</Text>
                </Pressable>
                <Text style={[typography.caption, { color: colors.inkFaint }]}>—</Text>
                <Pressable
                  onPress={() => setPicker({ dayIndex: idx, field: "end" })}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: radius.sm,
                    backgroundColor: colors.surface,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 6,
                  }}
                >
                  <Clock size={12} color={colors.inkFaint} strokeWidth={2.25} />
                  <Text style={[typography.caption, { color: colors.ink, marginLeft: 4 }]}>{toTimeString(day.end)}</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}

      {picker && (
        <DateTimePicker
          value={picker.field === "start" ? days[picker.dayIndex].start : days[picker.dayIndex].end}
          mode="time"
          display="default"
          onChange={(_event, date) => {
            const p = picker;
            setPicker(null);
            if (!date || !p) return;
            updateDay(p.dayIndex, p.field === "start" ? { start: date } : { end: date });
          }}
        />
      )}

      <View style={{ marginTop: spacing.xl }}>
        <Button label={strings.common.save} onPress={handleSave} loading={saving} />
      </View>
    </Screen>
  );
}
