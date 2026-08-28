// Palette per le geometrie procedurali 3D (nessun asset esterno: solo forme
// e colori originali costruiti con primitive Three.js).

export const CROP_COLORS: Record<string, { leaf: string; fruit: string }> = {
  carota: { leaf: '#4caf50', fruit: '#ff9840' },
  fagiolo: { leaf: '#3f9142', fruit: '#7bc86c' },
  grano: { leaf: '#c9a227', fruit: '#e6c14d' },
  patata: { leaf: '#5b8a3a', fruit: '#c69a5a' },
  peperone: { leaf: '#3f9142', fruit: '#e0433d' },
  mais: { leaf: '#5b8a3a', fruit: '#f4cf4e' },
}

export const ANIMAL_COLORS: Record<string, { body: string; accent: string }> = {
  gallina: { body: '#f6f1e5', accent: '#e2483d' },
  pecora: { body: '#f5f2ea', accent: '#5a4632' },
  mucca: { body: '#f7f4ee', accent: '#3a3a3a' },
  maiale: { body: '#f4b8c0', accent: '#e88fa0' },
}

export const BUILDING_COLORS: Record<string, { wall: string; roof: string }> = {
  pollaio: { wall: '#e8c98a', roof: '#c65a4a' },
  ovile: { wall: '#e8dfc9', roof: '#8a6a4a' },
  stalla: { wall: '#e3c9a0', roof: '#b5342a' },
  porcile: { wall: '#e0c6a3', roof: '#8a5a3a' },
  mulino: { wall: '#cfc7ba', roof: '#8a7a6a' },
  caseificio: { wall: '#eef0ea', roof: '#7ab0c9' },
  forno: { wall: '#d9a066', roof: '#8a4a2a' },
  filanda: { wall: '#d8cbe0', roof: '#6a4a8a' },
}
