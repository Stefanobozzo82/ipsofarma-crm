import { z } from "zod";
import { ServiceType } from "../enums";

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Orario non valido, usa HH:MM");

/**
 * Quali campi sono obbligatori dipende dal price_unit che il sitter ha
 * impostato per questo servizio (per_night richiede endDate, per_hour
 * richiede start/endTime, ...) — informazione che vive in sitter_services,
 * non nella richiesta. La validazione di coerenza è quindi nel service
 * layer del backend (vedi booking.service.ts), non qui: questo schema
 * valida solo la forma dei dati in arrivo.
 */
export const createBookingSchema = z.object({
  sitterId: z.string().uuid(),
  serviceType: z.nativeEnum(ServiceType),
  petIds: z.array(z.string().uuid()).min(1, "Seleziona almeno un animale"),
  startDate: z.string().date(),
  endDate: z.string().date().optional(),
  startTime: timeString.optional(),
  endTime: timeString.optional(),
  notes: z.string().max(1000).optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const declineBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type DeclineBookingInput = z.infer<typeof declineBookingSchema>;

export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const createMeetGreetSchema = z.object({
  sitterId: z.string().uuid(),
  proposedDatetime: z.string().datetime(),
  notes: z.string().max(500).optional(),
});
export type CreateMeetGreetInput = z.infer<typeof createMeetGreetSchema>;

/** Azioni su un meet & greet esistente: entrambe le parti possono
 * cancellare; solo il sitter accetta/rifiuta/ripropone un nuovo orario. */
export const updateMeetGreetSchema = z
  .object({
    action: z.enum(["accept", "decline", "propose", "cancel"]),
    proposedDatetime: z.string().datetime().optional(),
  })
  .refine((v) => v.action !== "propose" || v.proposedDatetime !== undefined, {
    message: "proposedDatetime è richiesto quando action = propose",
    path: ["proposedDatetime"],
  });
export type UpdateMeetGreetInput = z.infer<typeof updateMeetGreetSchema>;

export const requestPayoutSchema = z.object({
  amount: z.number().positive().optional(),
});
export type RequestPayoutInput = z.infer<typeof requestPayoutSchema>;
