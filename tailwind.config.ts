import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          ink: "#05070b",
          navy: "#071525",
          navySoft: "#0d2238",
          gold: "#d6b25e",
          goldLight: "#f4df9a",
          bone: "#f7f3ea",
          smoke: "#e7e9ee"
        }
      },
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Sora", "Manrope", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 18px 60px rgba(5, 7, 11, 0.12)",
        gold: "0 22px 70px rgba(214, 178, 94, 0.24)",
        navy: "0 28px 90px rgba(7, 21, 37, 0.32)"
      }
    }
  },
  plugins: []
} satisfies Config;
