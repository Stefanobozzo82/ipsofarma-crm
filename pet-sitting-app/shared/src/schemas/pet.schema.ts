import { z } from "zod";
import { PetSpecies } from "../enums";

export const createPetSchema = z.object({
  name: z.string().min(1, "Il nome dell'animale è obbligatorio").max(60),
  species: z.nativeEnum(PetSpecies),
  breed: z.string().max(100).optional(),
  birthDate: z.string().date().optional(),
  weightKg: z.number().positive().max(150).optional(),
  sex: z.enum(["male", "female"]).optional(),
  isNeutered: z.boolean().optional(),
  photoUrl: z.string().url().optional(),
  behavioralNotes: z.string().max(2000).optional(),
  medicalNotes: z.string().max(2000).optional(),
  dietaryNotes: z.string().max(2000).optional(),
  vetName: z.string().max(120).optional(),
  vetPhone: z.string().max(30).optional(),
  microchipId: z.string().max(50).optional(),
});
export type CreatePetInput = z.infer<typeof createPetSchema>;

export const updatePetSchema = createPetSchema.partial();
export type UpdatePetInput = z.infer<typeof updatePetSchema>;
