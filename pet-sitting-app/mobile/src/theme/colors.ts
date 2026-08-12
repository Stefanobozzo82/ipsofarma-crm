/** Stessa identità dell'artifact di progettazione (verde cipresso, ambra
 * come accento secondario) — vedi il blueprint pubblicato in Fase 1. */
const light = {
  bg: "#F5F7F3",
  surface: "#FFFFFF",
  surfaceMuted: "#EEF2EC",
  ink: "#182018",
  inkMuted: "#4D5B4E",
  inkFaint: "#7C8A7C",
  line: "#DBE2D8",
  accent: "#2F6F52",
  accentInk: "#F3FBF5",
  accentSoft: "#E3EEE6",
  amber: "#A8611F",
  amberSoft: "#F4E6D6",
  danger: "#B23B3B",
  dangerSoft: "#F5E4E4",
};

const dark = {
  bg: "#10140F",
  surface: "#171D17",
  surfaceMuted: "#1D251E",
  ink: "#E9EFE7",
  inkMuted: "#9DB19F",
  inkFaint: "#6D8073",
  line: "#29342A",
  accent: "#5BB98A",
  accentInk: "#0B1610",
  accentSoft: "#1E2E24",
  amber: "#E2A25C",
  amberSoft: "#332318",
  danger: "#E08787",
  dangerSoft: "#3A1F1F",
};

export const palettes = { light, dark };
export type Palette = typeof light;
