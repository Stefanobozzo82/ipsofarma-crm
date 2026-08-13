/** Design system "caldo" (terracotta/miele) — Fase redesign UI/UX,
 * ispirato ai marketplace pet-care USA (Rover/Wag/PetBnb) reinterpretato con
 * identità propria. Sostituisce la palette verde cipresso/ambra originale:
 * quella comunicava "corporate/fintech", qui vogliamo fiducia e calore.
 *
 * `accent` (terracotta) è il colore di brand — usato per azioni primarie,
 * elementi attivi, link. `success` (salvia) è un token separato per gli
 * stati "positivi" (prenotazione confermata, sitter approvato): prima
 * dell'unificazione qui, quel significato viveva sullo stesso token
 * dell'accento di brand, il che avrebbe reso ogni badge di successo
 * arancione invece che verde — un problema di leggibilità reale, non solo
 * estetico (il verde per "ok" è una convenzione che gli utenti si aspettano).
 */
const light = {
  bg: "#FBF6F0",
  surface: "#FFFDF9",
  surfaceMuted: "#F3EAE0",
  ink: "#2B211C",
  inkMuted: "#6B5D53",
  inkFaint: "#A89A8E",
  line: "#EAD9C8",
  accent: "#E8603C",
  accentInk: "#FFF8F2",
  accentSoft: "#FBE4DA",
  amber: "#B5761F",
  amberSoft: "#FBEDD4",
  success: "#4F8B6B",
  successSoft: "#E1EEE6",
  danger: "#D64545",
  dangerSoft: "#F9DEDE",
};

const dark = {
  bg: "#1A1512",
  surface: "#241E1A",
  surfaceMuted: "#2C2420",
  ink: "#F2EAE3",
  inkMuted: "#C4B6AC",
  inkFaint: "#8A7A6E",
  line: "#3A2F28",
  accent: "#F0755A",
  accentInk: "#241109",
  accentSoft: "#3D2A22",
  amber: "#F0B85C",
  amberSoft: "#3D2F1A",
  success: "#6FAE8A",
  successSoft: "#22322A",
  danger: "#E37070",
  dangerSoft: "#3D2020",
};

export const palettes = { light, dark };
export type Palette = typeof light;
