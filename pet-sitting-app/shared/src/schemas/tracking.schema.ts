import { z } from "zod";

export const createServiceUpdateSchema = z.object({
  type: z.enum(["start", "update", "end"]),
  note: z.string().max(1000).optional(),
  photoUrls: z.array(z.string().url()).max(6).default([]),
});
export type CreateServiceUpdateInput = z.infer<typeof createServiceUpdateSchema>;

export const requestServicePhotoUploadSchema = z.object({
  fileExt: z
    .string()
    .regex(/^[a-zA-Z0-9]{2,5}$/, "Estensione file non valida")
    .default("jpg"),
});
export type RequestServicePhotoUploadInput = z.infer<typeof requestServicePhotoUploadSchema>;

export const gpsPingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type GpsPingInput = z.infer<typeof gpsPingSchema>;
