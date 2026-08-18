import type { Pet } from "@fido/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapPetRow(row: any): Pet {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    species: row.species,
    breed: row.breed,
    birthDate: row.birth_date,
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    sex: row.sex,
    isNeutered: row.is_neutered,
    photoUrl: row.photo_url,
    behavioralNotes: row.behavioral_notes,
    medicalNotes: row.medical_notes,
    dietaryNotes: row.dietary_notes,
    vetName: row.vet_name,
    vetPhone: row.vet_phone,
    microchipId: row.microchip_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
