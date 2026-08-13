import type { GpsTrack, ServiceType } from "@fido/shared";
import * as Location from "expo-location";
import { Footprints } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { TextField } from "@/components/TextField";
import { addServiceUpdate, getGpsTrack, pingGpsTrack, startGpsTrack, stopGpsTrack } from "@/features/tracking/api";
import { strings } from "@/i18n/strings";
import { useTheme } from "@/theme/use-theme";

interface ServiceTrackingPanelProps {
  bookingId: string;
  serviceType: ServiceType;
  onUpdateSent: () => void;
}

/** Pallino che pulsa mentre il GPS è attivo — il segnale "live" che rende
 * questa schermata rassicurante invece di un semplice pannello di controlli
 * (brief: la schermata "durante il servizio" deve comunicare che qualcuno
 * la sta seguendo davvero). `Animated` è già incluso in React Native,
 * nessuna libreria di animazione aggiunta solo per questo. */
function PulseDot({ color }: { color: string }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity, marginRight: 6 }}
    />
  );
}

/** Controlli lato sitter durante un servizio 'in_progress': tracking GPS
 * (solo dog_walking — un house sitting non ha un percorso da tracciare) e
 * invio di un aggiornamento testuale, sempre disponibile. Niente foto in
 * questo giro: il backend espone già l'URL di upload firmato
 * (POST /bookings/:id/updates/upload-url) ma il picker lato mobile non è
 * ancora collegato — vedi mobile/README.md. */
export function ServiceTrackingPanel({ bookingId, serviceType, onUpdateSent }: ServiceTrackingPanelProps) {
  const { colors, spacing, radius, typography } = useTheme();
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const [track, setTrack] = useState<GpsTrack | null>(null);
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [note, setNote] = useState("");
  const [sendingNote, setSendingNote] = useState(false);

  useEffect(() => {
    if (serviceType === "dog_walking") {
      getGpsTrack(bookingId).then(setTrack).catch(() => {});
    }
    return () => {
      watchRef.current?.remove();
    };
  }, [bookingId, serviceType]);

  const isTracking = track && !track.endedAt;

  async function handleStartTracking() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(strings.tracking.locationPermissionDenied);
      return;
    }
    setTrackingBusy(true);
    try {
      const started = await startGpsTrack(bookingId);
      setTrack(started);
      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 15 },
        (position) => {
          pingGpsTrack(bookingId, position.coords.latitude, position.coords.longitude)
            .then(setTrack)
            .catch(() => {});
        },
      );
    } catch {
      Alert.alert(strings.common.genericError);
    } finally {
      setTrackingBusy(false);
    }
  }

  async function handleStopTracking() {
    setTrackingBusy(true);
    try {
      watchRef.current?.remove();
      watchRef.current = null;
      const final = await stopGpsTrack(bookingId);
      setTrack(final);
    } catch {
      Alert.alert(strings.common.genericError);
    } finally {
      setTrackingBusy(false);
    }
  }

  async function handleSendNote() {
    if (!note.trim()) return;
    setSendingNote(true);
    try {
      await addServiceUpdate(bookingId, { type: "update", note: note.trim(), photoUrls: [] });
      setNote("");
      onUpdateSent();
    } catch {
      Alert.alert(strings.common.genericError);
    } finally {
      setSendingNote(false);
    }
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <Text style={[typography.label, { color: colors.inkFaint, marginBottom: spacing.sm }]}>{strings.tracking.title}</Text>

      {serviceType === "dog_walking" && (
        <View style={{ marginBottom: spacing.md }}>
          {track?.distanceKm != null ? (
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.md }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radius.md,
                  backgroundColor: colors.accentSoft,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: spacing.md,
                }}
              >
                <Footprints size={22} color={colors.accent} strokeWidth={2} />
              </View>
              <View>
                <Text style={[typography.title, { color: colors.ink }]}>{track.distanceKm.toFixed(2)} km</Text>
                <Text style={[typography.caption, { color: colors.inkFaint }]}>{strings.tracking.distanceLabel}</Text>
              </View>
            </View>
          ) : isTracking ? (
            <View style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.xs }}>
                <PulseDot color={colors.success} />
                <Text style={[typography.bodyStrong, { color: colors.success }]}>{strings.tracking.gpsActive}</Text>
              </View>
              <Text style={[typography.caption, { color: colors.inkFaint }]}>
                {strings.tracking.pointsLabel(track?.points.length ?? 0)}
              </Text>
            </View>
          ) : null}

          <Button
            label={isTracking ? strings.tracking.stopGps : strings.tracking.startGps}
            onPress={isTracking ? handleStopTracking : handleStartTracking}
            variant={isTracking ? "danger" : "secondary"}
            loading={trackingBusy}
          />
        </View>
      )}

      <TextField value={note} onChangeText={setNote} placeholder={strings.tracking.updatePlaceholder} multiline />
      <Button label={strings.tracking.sendUpdate} onPress={handleSendNote} variant="secondary" loading={sendingNote} disabled={!note.trim()} />
    </Card>
  );
}
