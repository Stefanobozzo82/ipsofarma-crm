import { CancellationPolicyType } from "../enums";

export interface CancellationRule {
  /** Rimborso pieno se cancellato con almeno queste ore di anticipo sull'inizio. */
  fullRefundHoursBefore: number;
  /** Rimborso parziale se cancellato tra fullRefundHoursBefore e questa soglia (ore prima). Assente = nessuna via di mezzo. */
  partialRefundHoursBefore?: number;
  partialRefundPercent?: number;
  labelIt: string;
}

/**
 * 3 preset tra cui il sitter sceglie (non regole libere per-sitter): più
 * facili da confrontare in ricerca e da spiegare al proprietario in fase di
 * prenotazione. Vedi backend/src/modules/bookings/booking.service.ts per
 * l'applicazione al momento della cancellazione.
 */
export const CANCELLATION_RULES: Record<CancellationPolicyType, CancellationRule> = {
  [CancellationPolicyType.Flexible]: {
    fullRefundHoursBefore: 24,
    labelIt: "Flessibile — rimborso pieno fino a 24h prima",
  },
  [CancellationPolicyType.Moderate]: {
    fullRefundHoursBefore: 72,
    partialRefundHoursBefore: 24,
    partialRefundPercent: 50,
    labelIt: "Moderata — rimborso pieno fino a 72h prima, 50% fino a 24h prima",
  },
  [CancellationPolicyType.Strict]: {
    fullRefundHoursBefore: 24 * 7,
    labelIt: "Rigida — rimborso pieno solo fino a 7 giorni prima",
  },
};
