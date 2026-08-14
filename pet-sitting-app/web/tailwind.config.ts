import type { Config } from "tailwindcss";

/**
 * Stessa palette "terracotta/miele" del design system mobile
 * (mobile/src/theme/colors.ts, solo valori "light" — il sito non ha una
 * modalità scura, come Rover.com stesso) — riportata qui 1:1 in esadecimale
 * così sito e app sembrano la stessa azienda invece di due prodotti diversi.
 * Stessa storia per i font: Nunito per i titoli, Inter per il testo.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#FBF6F0",
        surface: "#FFFDF9",
        "surface-muted": "#F3EAE0",
        ink: "#2B211C",
        "ink-muted": "#6B5D53",
        "ink-faint": "#A89A8E",
        line: "#EAD9C8",
        accent: "#E8603C",
        "accent-ink": "#FFF8F2",
        "accent-soft": "#FBE4DA",
        amber: "#B5761F",
        "amber-soft": "#FBEDD4",
        success: "#4F8B6B",
        "success-soft": "#E1EEE6",
        danger: "#D64545",
        "danger-soft": "#F9DEDE",
      },
      fontFamily: {
        display: ["Nunito", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      borderRadius: {
        xl: "16px",
        "2xl": "20px",
        "3xl": "28px",
      },
      boxShadow: {
        soft: "0 1px 3px rgba(43,33,28,0.07)",
        lifted: "0 8px 24px rgba(43,33,28,0.10)",
      },
      maxWidth: {
        content: "1200px",
      },
    },
  },
  plugins: [],
} satisfies Config;
