import type { CreatePetInput, Pet, UpdatePetInput } from "@fido/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../../lib/app-error";
import { mapPetRow } from "./pets.mapper";

const PET_COLUMNS =
  "id, owner_id, name, species, breed, birth_date, weight_kg, sex, is_neutered, photo_url, behavioral_notes, medical_notes, dietary_notes, vet_name, vet_phone, microchip_id, created_at, updated_at";

/** camelCase → snake_case, solo per i campi effettivamente presenti
 * nell'input (permette PATCH parziali senza sovrascrivere con null). */
function toPetPatch(input: Partial<CreatePetInput>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.species !== undefined) patch.species = input.species;
  if (input.breed !== undefined) patch.breed = input.breed;
  if (input.birthDate !== undefined) patch.birth_date = input.birthDate;
  if (input.weightKg !== undefined) patch.weight_kg = input.weightKg;
  if (input.sex !== undefined) patch.sex = input.sex;
  if (input.isNeutered !== undefined) patch.is_neutered = input.isNeutered;
  if (input.photoUrl !== undefined) patch.photo_url = input.photoUrl;
  if (input.behavioralNotes !== undefined) patch.behavioral_notes = input.behavioralNotes;
  if (input.medicalNotes !== undefined) patch.medical_notes = input.medicalNotes;
  if (input.dietaryNotes !== undefined) patch.dietary_notes = input.dietaryNotes;
  if (input.vetName !== undefined) patch.vet_name = input.vetName;
  if (input.vetPhone !== undefined) patch.vet_phone = input.vetPhone;
  if (input.microchipId !== undefined) patch.microchip_id = input.microchipId;
  return patch;
}

export async function listMyPets(supabase: SupabaseClient, ownerId: string): Promise<Pet[]> {
  const { data, error } = await supabase
    .from("pets")
    .select(PET_COLUMNS)
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw AppError.badRequest("Impossibile recuperare gli animali");
  return (data ?? []).map(mapPetRow);
}

export async function createPet(supabase: SupabaseClient, ownerId: string, input: CreatePetInput): Promise<Pet> {
  const { data, error } = await supabase
    .from("pets")
    .insert({ ...toPetPatch(input), owner_id: ownerId })
    .select(PET_COLUMNS)
    .single();

  if (error || !data) throw AppError.badRequest("Impossibile creare il profilo animale");
  return mapPetRow(data);
}

export async function getMyPet(supabase: SupabaseClient, petId: string): Promise<Pet> {
  const { data, error } = await supabase
    .from("pets")
    .select(PET_COLUMNS)
    .eq("id", petId)
    .is("deleted_at", null)
    .single();

  if (error || !data) throw AppError.notFound("Animale non trovato");
  return mapPetRow(data);
}

export async function updateMyPet(supabase: SupabaseClient, petId: string, input: UpdatePetInput): Promise<Pet> {
  const { data, error } = await supabase
    .from("pets")
    .update(toPetPatch(input))
    .eq("id", petId)
    .is("deleted_at", null)
    .select(PET_COLUMNS)
    .single();

  if (error || !data) throw AppError.badRequest("Impossibile aggiornare l'animale");
  return mapPetRow(data);
}

export async function deleteMyPet(supabase: SupabaseClient, petId: string): Promise<void> {
  const { error } = await supabase.from("pets").update({ deleted_at: new Date().toISOString() }).eq("id", petId);
  if (error) throw AppError.badRequest("Impossibile rimuovere l'animale");
}
