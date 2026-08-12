/**
 * Crea due account demo (un proprietario e un sitter approvato) per testare
 * in locale i flussi di autenticazione e profilo appena scritti.
 *
 * Uso:
 *   pnpm --filter backend seed
 *
 * Richiede backend/.env compilato con un progetto Supabase raggiungibile
 * (locale via `supabase start`, o un progetto hosted di sviluppo).
 */
import { supabaseAdmin } from "../src/lib/supabase";
import { logger } from "../src/lib/logger";

const DEMO_PASSWORD = "FidoDemo123!";

async function createDemoUser(email: string, firstName: string, lastName: string) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName, gdpr_consent: true },
  });

  if (error) {
    if (error.message.includes("already been registered")) {
      logger.warn(`${email} esiste già, salto la creazione`);
      const { data: list } = await supabaseAdmin.auth.admin.listUsers();
      const existing = list?.users.find((u) => u.email === email);
      if (!existing) throw error;
      return existing.id;
    }
    throw error;
  }

  return data.user.id;
}

async function seed() {
  logger.info("Seed: creazione account demo...");

  const ownerId = await createDemoUser("owner-demo@fido.local", "Mario", "Rossi");
  await supabaseAdmin
    .from("owner_profiles")
    .upsert({ user_id: ownerId, address: "Via Roma 1, Cosenza", latitude: 39.2986, longitude: 16.2539 });
  await supabaseAdmin.from("pets").insert({
    owner_id: ownerId,
    name: "Fido",
    species: "dog",
    breed: "Meticcio",
    behavioral_notes: "Socievole con altri cani, un po' timido con gli sconosciuti.",
  });

  const sitterId = await createDemoUser("sitter-demo@fido.local", "Giulia", "Bianchi");
  await supabaseAdmin.from("sitter_profiles").upsert({
    user_id: sitterId,
    bio: "Amo gli animali da sempre, due cani miei e 5 anni di esperienza con dog sitting nel quartiere.",
    experience_years: 5,
    address: "Corso Mazzini 10, Cosenza",
    base_latitude: 39.3057,
    base_longitude: 16.2503,
    service_radius_km: 8,
    status: "approved",
    verification_status: "verified",
    approved_at: new Date().toISOString(),
  });
  // Senza un servizio attivo il sitter non compare mai in GET /search/sitters.
  await supabaseAdmin.from("sitter_services").upsert(
    { sitter_id: sitterId, service_type: "dog_walking", price: 15, price_unit: "per_walk", duration_minutes: 30, max_pets: 2 },
    { onConflict: "sitter_id,service_type" },
  );
  await supabaseAdmin.from("sitter_availability").upsert(
    [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      sitter_id: sitterId,
      day_of_week: dayOfWeek,
      start_time: "09:00",
      end_time: "18:00",
    })),
  );

  // Un secondo sitter ancora in coda di approvazione, per testare il pannello admin.
  const pendingSitterId = await createDemoUser("sitter-pending-demo@fido.local", "Luca", "Verdi");
  await supabaseAdmin.from("sitter_profiles").upsert({
    user_id: pendingSitterId,
    bio: "Studente, disponibile nel weekend per passeggiate ed è la mia prima candidatura come sitter.",
    experience_years: 1,
    address: "Via Popilia 5, Cosenza",
    base_latitude: 39.31,
    base_longitude: 16.2489,
    service_radius_km: 5,
  });

  const adminId = await createDemoUser("admin-demo@fido.local", "Admin", "Fido");
  await supabaseAdmin.from("users").update({ role: "admin" }).eq("id", adminId);

  logger.info("Seed completato:");
  logger.info(`  owner           -> owner-demo@fido.local           / ${DEMO_PASSWORD}`);
  logger.info(`  sitter approvato -> sitter-demo@fido.local          / ${DEMO_PASSWORD}`);
  logger.info(`  sitter in coda   -> sitter-pending-demo@fido.local  / ${DEMO_PASSWORD}`);
  logger.info(`  admin            -> admin-demo@fido.local           / ${DEMO_PASSWORD}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error("Seed fallito", err);
    process.exit(1);
  });
