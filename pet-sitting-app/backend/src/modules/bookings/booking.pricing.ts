import { PLATFORM, PriceUnit } from "@fido/shared";
import { AppError } from "../../lib/app-error";

interface QuantityInput {
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
}

function diffDays(startDate: string, endDate: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / msPerDay);
}

function diffHours(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  return (endHour * 60 + endMinute - (startHour * 60 + startMinute)) / 60;
}

/**
 * Deriva la quantità da fatturare dal price_unit del servizio scelto dal
 * sitter — è lui a decidere se un servizio si paga a notte, a ora, a visita.
 * Il proprietario fornisce le date/orari, non la quantità: evita che i due
 * lati calcolino il prezzo in modo diverso.
 */
export function computeQuantity(priceUnit: PriceUnit, input: QuantityInput): number {
  switch (priceUnit) {
    case PriceUnit.PerWalk:
    case PriceUnit.PerVisit:
      return 1;

    case PriceUnit.PerNight: {
      if (!input.endDate) throw AppError.badRequest("endDate è richiesta per un servizio a tariffa notturna (boarding)");
      const nights = diffDays(input.startDate, input.endDate);
      if (nights < 1) throw AppError.badRequest("endDate deve essere successiva a startDate");
      return nights;
    }

    case PriceUnit.PerDay: {
      if (!input.endDate) return 1;
      const days = diffDays(input.startDate, input.endDate) + 1;
      if (days < 1) throw AppError.badRequest("endDate non può precedere startDate");
      return days;
    }

    case PriceUnit.PerHour: {
      if (!input.startTime || !input.endTime) {
        throw AppError.badRequest("startTime e endTime sono richiesti per un servizio a tariffa oraria");
      }
      const hours = diffHours(input.startTime, input.endTime);
      if (hours <= 0) throw AppError.badRequest("endTime deve essere successivo a startTime");
      return Math.round(hours * 100) / 100;
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface PriceBreakdown {
  quantity: number;
  unitPrice: number;
  priceTotal: number;
  platformFee: number;
  sitterPayout: number;
}

/** Il proprietario paga esattamente priceTotal (= unitPrice × quantity),
 * nessuna fee aggiuntiva — la commissione è trattenuta solo dal payout del
 * sitter. Vedi shared/src/constants/platform.ts. */
export function computeBreakdown(unitPrice: number, quantity: number): PriceBreakdown {
  const priceTotal = round2(unitPrice * quantity);
  const platformFee = round2(priceTotal * PLATFORM.SITTER_COMMISSION_PERCENT);
  const sitterPayout = round2(priceTotal - platformFee);
  return { quantity, unitPrice, priceTotal, platformFee, sitterPayout };
}
