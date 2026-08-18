export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

/** Ombre morbide, non bordi duri — vedi Card.tsx. Prima non esisteva alcun
 * token ombra nel tema: ogni card si distingueva solo con un bordo sottile,
 * più "piatto/tecnico" di quanto il redesign richieda. `sm` per elementi in
 * lista, `md` per card in evidenza/superfici sollevate (modali, sheet). */
export const shadow = {
  sm: {
    shadowColor: "#2B211C",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: "#2B211C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
};

/** Due famiglie, come da design system: Nunito per titoli (arrotondato,
 * caldo) e Inter per corpo testo (leggibile, neutro) — caricate in
 * app/_layout.tsx via useFonts. I nomi devono combaciare esattamente con le
 * costanti esportate da @expo-google-fonts/*. */
export const fonts = {
  displayBold: "Nunito_800ExtraBold",
  headingBold: "Nunito_700Bold",
  headingSemiBold: "Nunito_600SemiBold",
  bodyRegular: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemiBold: "Inter_600SemiBold",
};

export const typography = {
  display: { fontSize: 30, fontFamily: fonts.displayBold, letterSpacing: -0.3 },
  title: { fontSize: 21, fontFamily: fonts.headingBold },
  subtitle: { fontSize: 16, fontFamily: fonts.headingSemiBold },
  body: { fontSize: 15, fontFamily: fonts.bodyRegular },
  bodyStrong: { fontSize: 15, fontFamily: fonts.bodySemiBold },
  caption: { fontSize: 13, fontFamily: fonts.bodyRegular },
  label: { fontSize: 11, fontFamily: fonts.bodySemiBold, letterSpacing: 0.5, textTransform: "uppercase" as const },
};
