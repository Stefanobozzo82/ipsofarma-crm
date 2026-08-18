import type { PetSpecies } from "../enums";

export type PetSex = "male" | "female";

export interface Pet {
  id: string;
  ownerId: string;
  name: string;
  species: PetSpecies;
  breed: string | null;
  birthDate: string | null;
  weightKg: number | null;
  sex: PetSex | null;
  isNeutered: boolean | null;
  photoUrl: string | null;
  behavioralNotes: string | null;
  medicalNotes: string | null;
  dietaryNotes: string | null;
  vetName: string | null;
  vetPhone: string | null;
  microchipId: string | null;
  createdAt: string;
  updatedAt: string;
}
