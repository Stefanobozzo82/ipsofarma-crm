import { logger } from "./logger";

/**
 * Stub: l'invio push reale (Firebase Cloud Messaging per Android, APNs per
 * iOS — o il servizio push di Expo che intermedia entrambi) richiede un
 * progetto Firebase e credenziali del cliente che non esistono in questo
 * ambiente. La riga in `notifications` viene comunque creata (feed in-app
 * funzionante da subito): questa funzione è il punto unico da cui, quando
 * le credenziali ci saranno, si chiamerà l'API Expo Push
 * (https://docs.expo.dev/push-notifications/sending-notifications/) o FCM
 * direttamente, passando i token da `push_tokens`.
 */
export async function sendPushNotification(
  tokens: string[],
  payload: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  if (tokens.length === 0) return;
  logger.info(`[push:stub] ${tokens.length} destinatari — "${payload.title}" (invio reale non configurato)`);
}
