import { z } from "zod";
import { DocumentType } from "../enums";

export const sitterApplySchema = z.object({
  bio: z.string().min(20, "Racconta qualcosa in più di te (almeno 20 caratteri)").max(2000),
  experienceYears: z.number().int().min(0).max(60),
  address: z.string().min(3),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  serviceRadiusKm: z.number().int().min(1).max(50),
});
export type SitterApplyInput = z.infer<typeof sitterApplySchema>;

export const updateSitterProfileSchema = sitterApplySchema.partial();
export type UpdateSitterProfileInput = z.infer<typeof updateSitterProfileSchema>;

/** Richiede un URL di upload firmato per un documento di identità;
 * il file viene caricato dal client direttamente su Supabase Storage. */
export const requestDocumentUploadSchema = z.object({
  documentType: z.nativeEnum(DocumentType),
  fileExt: z
    .string()
    .regex(/^[a-zA-Z0-9]{2,5}$/, "Estensione file non valida")
    .default("pdf"),
});
export type RequestDocumentUploadInput = z.infer<typeof requestDocumentUploadSchema>;
