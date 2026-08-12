export interface GpsPoint {
  lat: number;
  lng: number;
  t: string;
}

export interface GpsTrack {
  id: string;
  bookingId: string;
  points: GpsPoint[];
  distanceKm: number | null;
  startedAt: string;
  endedAt: string | null;
}

export type ServiceUpdateType = "start" | "update" | "end";

export interface ServiceUpdate {
  id: string;
  bookingId: string;
  type: ServiceUpdateType;
  note: string | null;
  photoUrls: string[];
  createdAt: string;
}
