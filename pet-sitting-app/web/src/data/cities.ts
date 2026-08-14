/**
 * Directory città per la sezione SEO in fondo alla home. Contenuto
 * placeholder ma non inventato a caso: parte dalla zona di lancio reale
 * dell'app ("Cosenza e dintorni", vedi mobile/src/i18n/strings.ts) invece
 * di promettere una copertura nazionale che oggi non esiste. Quando la
 * copertura si allarga, aggiungere qui le nuove città/regioni basta a
 * propagarle in questa sezione.
 */
export interface CityRegion {
  region: string;
  cities: string[];
}

export const cityRegions: CityRegion[] = [
  {
    region: "Calabria",
    cities: ["Cosenza", "Rende", "Castrolibero", "Rogliano", "Montalto Uffugo", "San Giovanni in Fiore"],
  },
  {
    region: "Prossimamente",
    cities: ["Catanzaro", "Reggio Calabria", "Lamezia Terme", "Crotone"],
  },
];
