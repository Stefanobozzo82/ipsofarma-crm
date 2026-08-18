import { SERVICE_TYPE_LABELS_IT, ServiceType } from "@fido/shared";
import { DoorOpen, Footprints, Home, Sun, type LucideIcon } from "lucide-react";

/**
 * I 5 servizi core sono definiti una sola volta in @fido/shared (stessi
 * usati da backend/app) — qui aggiungiamo solo il contenuto marketing
 * (dove si svolge, per quali animali, descrizione, icona) che non ha senso
 * mettere in un pacchetto condiviso perché riguarda solo il sito.
 */
export interface ServiceContent {
  id: ServiceType;
  slug: string;
  label: string;
  icon: LucideIcon;
  where: string;
  forAnimals: string;
  description: string;
}

export const services: ServiceContent[] = [
  {
    id: ServiceType.Boarding,
    slug: "pet-sitting-soggiorno",
    label: SERVICE_TYPE_LABELS_IT[ServiceType.Boarding],
    icon: Home,
    where: "A casa del sitter",
    forAnimals: "Cani e gatti",
    description:
      "Il tuo animale dorme a casa del sitter come se fosse la sua famiglia, con aggiornamenti durante tutto il soggiorno.",
  },
  {
    id: ServiceType.HouseSitting,
    slug: "pet-sitting-a-domicilio",
    label: SERVICE_TYPE_LABELS_IT[ServiceType.HouseSitting],
    icon: DoorOpen,
    where: "A casa tua",
    forAnimals: "Cani, gatti e altri animali",
    description:
      "Il sitter viene a stare a casa tua: il tuo animale resta nel suo ambiente abituale, senza stress da trasferimento.",
  },
  {
    id: ServiceType.DropIn,
    slug: "visite-a-domicilio",
    label: SERVICE_TYPE_LABELS_IT[ServiceType.DropIn],
    icon: DoorOpen,
    where: "A casa tua, una o più visite al giorno",
    forAnimals: "Cani, gatti e altri animali",
    description:
      "Visite brevi per cibo, acqua, coccole e una sgranchita — perfette per assenze durante la giornata lavorativa.",
  },
  {
    id: ServiceType.DayCare,
    slug: "asilo-diurno",
    label: SERVICE_TYPE_LABELS_IT[ServiceType.DayCare],
    icon: Sun,
    where: "A casa del sitter, durante il giorno",
    forAnimals: "Cani",
    description: "Una giornata di compagnia e gioco a casa del sitter, senza restare da solo mentre sei fuori.",
  },
  {
    id: ServiceType.DogWalking,
    slug: "passeggiate",
    label: SERVICE_TYPE_LABELS_IT[ServiceType.DogWalking],
    icon: Footprints,
    where: "Nel tuo quartiere",
    forAnimals: "Cani",
    description: "Una passeggiata su misura per il tuo cane, con orari flessibili e aggiornamenti in tempo reale.",
  },
];
