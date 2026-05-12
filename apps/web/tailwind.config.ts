import type { Config } from "tailwindcss";

// DriverHub × Tactile design system v2.
// Anchor: gold + bone (preserved brand) wrapped in Material 3-style surface tokens.
// Each color has a light-mode default plus a `dark.*` mirror; component classes use
// `dark:` variants to swap them. Legacy `brand.*` aliases are kept temporarily so the
// older pages keep building while they migrate to the semantic names.

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Brand anchors — preserved
        brand: {
          ink: "#0a0b0d",
          navy: "#11161f",
          navySoft: "#1c1f24",
          gold: "#d6b25e",
          goldLight: "#f4df9a",
          goldDark: "#a17820",
          bone: "#f7f3ea",
          smoke: "#e7e9ee"
        },
        // Surface system (light) — Material 3 inspired
        surface: "#f9f5ec",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#fbf7ed",
        "surface-container": "#efe8d6",
        "surface-container-high": "#e7dec6",
        "surface-container-highest": "#ddd1b3",
        "surface-bright": "#ffffff",
        "surface-dim": "#e7dec6",
        "on-surface": "#15110a",
        "on-surface-variant": "#5f5747",
        outline: "#a8987a",
        "outline-variant": "#d9c9a7",
        "inverse-surface": "#11161f",
        "inverse-on-surface": "#f6eedf",
        // Action / accent — gold replaces signal-blue
        primary: "#0a0b0d",
        "on-primary": "#f6eedf",
        accent: "#d6b25e",
        "on-accent": "#0a0b0d",
        "accent-soft": "#f4df9a",
        "accent-deep": "#a17820",
        // Dark mirror
        dark: {
          bg: "#0a0b0d",
          surface: "#131518",
          surfaceElevated: "#1c1f24",
          surfaceContainer: "#23262d",
          text: "#f3f4f6",
          textMuted: "#9ca3af",
          outline: "rgba(255,255,255,0.12)"
        },
        // Semantic
        success: "#16a34a",
        warning: "#d97706",
        danger: "#ba1a1a",
        info: "#2563eb"
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["'Plus Jakarta Sans'", "Sora", "ui-sans-serif", "system-ui", "sans-serif"],
        editorial: ["Sora", "'Plus Jakarta Sans'", "ui-sans-serif", "sans-serif"]
      },
      fontSize: {
        "display-xl": ["80px", { lineHeight: "1.02", letterSpacing: "-0.035em", fontWeight: "800" }],
        "display-lg": ["64px", { lineHeight: "1.05", letterSpacing: "-0.03em", fontWeight: "800" }],
        "headline-lg": ["48px", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "800" }],
        "headline-md": ["32px", { lineHeight: "1.15", letterSpacing: "-0.015em", fontWeight: "700" }],
        "headline-sm": ["24px", { lineHeight: "1.25", fontWeight: "700" }],
        "title-lg": ["20px", { lineHeight: "1.35", fontWeight: "700" }],
        "title-md": ["18px", { lineHeight: "1.4", fontWeight: "700" }],
        "body-lg": ["18px", { lineHeight: "1.55", fontWeight: "500" }],
        "body-md": ["16px", { lineHeight: "1.55", fontWeight: "400" }],
        "body-sm": ["14px", { lineHeight: "1.5", fontWeight: "500" }],
        "label-bold": ["14px", { lineHeight: "1.35", letterSpacing: "0.02em", fontWeight: "700" }],
        "label-sm": ["12px", { lineHeight: "1.35", letterSpacing: "0.04em", fontWeight: "700" }],
        "label-xs": ["11px", { lineHeight: "1.35", letterSpacing: "0.08em", fontWeight: "800" }]
      },
      borderRadius: {
        none: "0",
        sm: "0.375rem",
        DEFAULT: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.25rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
        pill: "9999px",
        full: "9999px"
      },
      spacing: {
        base: "8px",
        gutter: "24px",
        "margin-mobile": "16px",
        "margin-desktop": "40px"
      },
      boxShadow: {
        "tactile-pop":
          "0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -1px rgb(0 0 0 / 0.05), inset 0 1px 0 0 rgb(255 255 255 / 0.55)",
        "tactile-pop-lg":
          "0 18px 40px -12px rgb(0 0 0 / 0.18), 0 6px 10px -4px rgb(0 0 0 / 0.08), inset 0 1px 0 0 rgb(255 255 255 / 0.6)",
        "tactile-dark":
          "0 8px 24px rgb(0 0 0 / 0.4), inset 0 1px 0 0 rgb(255 255 255 / 0.08)",
        "tactile-pressed": "inset 0 2px 4px 0 rgb(0 0 0 / 0.12)",
        "inner-subtle": "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)",
        soft: "0 18px 60px rgba(5, 7, 11, 0.12)",
        glow: "0 0 24px rgb(214 178 94 / 0.32)",
        gold: "0 22px 70px rgba(214, 178, 94, 0.28)",
        navy: "0 28px 90px rgba(7, 21, 37, 0.32)",
        glass: "0 8px 32px rgba(0, 0, 0, 0.37)"
      },
      backgroundImage: {
        "hero-blobs":
          "radial-gradient(circle at 18% 20%, rgba(214,178,94,0.35), transparent 38%), radial-gradient(circle at 82% 15%, rgba(28,31,36,0.85), transparent 32%), linear-gradient(135deg, #0a0b0d 0%, #11161f 55%, #02060c 100%)",
        "hero-aurora":
          "radial-gradient(800px circle at 0% 0%, rgba(214,178,94,0.18), transparent), radial-gradient(700px circle at 100% 20%, rgba(99,102,241,0.18), transparent)"
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "pulse-soft": {
          "0%,100%": { opacity: "0.6" },
          "50%": { opacity: "0.95" }
        }
      },
      animation: {
        "fade-in-up": "fade-in-up 0.4s ease-out both",
        "pulse-soft": "pulse-soft 5s ease-in-out infinite"
      }
    }
  },
  plugins: []
} satisfies Config;
