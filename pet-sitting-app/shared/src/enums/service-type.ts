/** I 5 servizi core dell'MVP — vedi docs/PHASE1-PROPOSAL.md §01. */
export const ServiceType = {
  DogWalking: "dog_walking",
  Boarding: "boarding",
  HouseSitting: "house_sitting",
  DropIn: "drop_in",
  DayCare: "day_care",
} as const;

export type ServiceType = (typeof ServiceType)[keyof typeof ServiceType];

export const SERVICE_TYPE_LABELS_IT: Record<ServiceType, string> = {
  [ServiceType.DogWalking]: "Passeggiata",
  [ServiceType.Boarding]: "Ospitalità overnight",
  [ServiceType.HouseSitting]: "House sitting",
  [ServiceType.DropIn]: "Visita a domicilio",
  [ServiceType.DayCare]: "Asilo diurno",
};

/** Unità di prezzo applicabile a un servizio offerto da un sitter. */
export const PriceUnit = {
  PerWalk: "per_walk",
  PerHour: "per_hour",
  PerNight: "per_night",
  PerDay: "per_day",
  PerVisit: "per_visit",
} as const;

export type PriceUnit = (typeof PriceUnit)[keyof typeof PriceUnit];
