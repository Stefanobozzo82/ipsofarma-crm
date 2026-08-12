import { z } from "zod";
import { PetSpecies, ServiceType } from "../enums";

/** Query di GET /search/sitters — z.coerce perché arriva come querystring. */
export const searchSittersQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  service: z.nativeEnum(ServiceType),
  radiusKm: z.coerce.number().int().min(1).max(50).default(15),
  species: z.nativeEnum(PetSpecies).optional(),
  date: z.string().date().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  maxPrice: z.coerce.number().positive().optional(),
});
export type SearchSittersQuery = z.infer<typeof searchSittersQuerySchema>;
