import { useTheme } from "../lib/useTheme";

// Floating button that flips between light and dark. Placed by App.tsx so every page
// inherits it. The icon comes from Material Symbols and is decorative; the aria-label
// carries the actionable copy.
export function ThemeToggle() {
  const { mode, toggle } = useTheme();
  const isDark = mode === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
      title={isDark ? "Modo claro" : "Modo escuro"}
      className="focus-ring tactile-pop tactile-pressed fixed bottom-6 left-6 z-40 flex h-11 w-11 items-center justify-center rounded-pill border border-outline-variant bg-surface-bright text-on-surface transition hover:scale-105 hover:shadow-gold dark:border-dark-outline dark:bg-dark-surfaceElevated dark:text-dark-text"
    >
      <span className="material-symbols-outlined text-[20px]" aria-hidden="true" style={{ fontVariationSettings: "'FILL' 1, 'wght' 500" }}>
        {isDark ? "light_mode" : "dark_mode"}
      </span>
    </button>
  );
}

export default ThemeToggle;
