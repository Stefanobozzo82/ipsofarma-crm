import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerPushToken } from "@/features/notifications/api";

/**
 * Best-effort e silenzioso: senza un progetto EAS configurato (nessun
 * `extra.eas.projectId` in app.json — questo scaffold non ne ha ancora
 * uno reale) `getExpoPushTokenAsync` può fallire. Non deve mai bloccare il
 * resto dell'app: il feed di notifiche in-app funziona indipendentemente
 * da questo, ed è comunque uno stub lato server finché non c'è un
 * progetto Firebase — vedi backend/src/lib/push.ts.
 */
export async function registerForPushNotifications(): Promise<void> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const { data: token } = await Notifications.getExpoPushTokenAsync();
    await registerPushToken({ token, platform: Platform.OS === "ios" ? "ios" : "android" });
  } catch (err) {
    console.warn("[push] registrazione token non riuscita (normale senza progetto EAS configurato)", err);
  }
}
