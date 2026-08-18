import type { CreatePetInput, Pet } from "@fido/shared";
import { apiFetch } from "@/lib/api";

export function listMyPets(): Promise<Pet[]> {
  return apiFetch<Pet[]>("/pets");
}

export function createPet(input: CreatePetInput): Promise<Pet> {
  return apiFetch<Pet>("/pets", { method: "POST", body: input });
}
