import { z } from "zod";
import { PriceUnit, ServiceType } from "../enums";

const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Orario non valido, usa HH:MM");

export const sitterServiceInputSchema = z
  .object({
    serviceType: z.nativeEnum(ServiceType),
    price: z.number().positive().max(9999),
    priceUnit: z.nativeEnum(PriceUnit),
    durationMinutes: z.number().int().positive().max(24 * 60).optional(),
    maxPets: z.number().int().min(1).max(10).default(1),
    isActive: z.boolean().default(true),
  })
  .refine((s) => s.durationMinutes === undefined || s.priceUnit === PriceUnit.PerWalk || s.priceUnit === PriceUnit.PerVisit, {
    message: "durationMinutes ha senso solo per tariffe a passeggiata o a visita",
    path: ["durationMinutes"],
  });
export type SitterServiceInput = z.infer<typeof sitterServiceInputSchema>;

/** Sostituisce l'intero listino del sitter — un elemento per service_type
 * (al più 5, uno per ciascun servizio dell'MVP). */
export const setSitterServicesSchema = z
  .array(sitterServiceInputSchema)
  .max(5)
  .refine((items) => new Set(items.map((i) => i.serviceType)).size === items.length, {
    message: "Ogni servizio può comparire una sola volta nel listino",
  });
export type SetSitterServicesInput = z.infer<typeof setSitterServicesSchema>;

const availabilitySlotSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: timeString,
    endTime: timeString,
    serviceType: z.nativeEnum(ServiceType).nullable().default(null),
  })
  .refine((s) => s.startTime < s.endTime, {
    message: "L'orario di fine deve essere successivo a quello di inizio",
    path: ["endTime"],
  });

const availabilityExceptionSchema = z.object({
  date: z.string().date(),
  isAvailable: z.boolean(),
  note: z.string().max(500).optional(),
});

/** Sostituisce interamente il pattern settimanale e le eccezioni del sitter. */
export const setSitterAvailabilitySchema = z.object({
  slots: z.array(availabilitySlotSchema).max(50),
  exceptions: z.array(availabilityExceptionSchema).max(200).default([]),
});
export type SetSitterAvailabilityInput = z.infer<typeof setSitterAvailabilitySchema>;
