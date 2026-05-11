import { useTheme } from "../lib/useTheme";

// Floating button that flips between light and dark. Placed by App.tsx so every page
// inherits it. Keep this tiny so it stays well below the FloatingAssistant in the stack.
export function ThemeToggle() {
  const { mode, toggle } = useTheme();
  const isDark = mode === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
      title={isDark ? "Modo claro" : "Modo escuro"}
      className="fixed bottom-6 left-6 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-brand-navy/15 bg-white text-brand-ink shadow-soft transition hover:scale-105 hover:shadow-gold dark:border-brand-bone/15 dark:bg-brand-navySoft dark:text-brand-bone"
    >
      <span aria-hidden="true" className="text-lg">
        {isDark ? "🌞" : "🌙"}
      </span>
    </button>
  );
}

export default ThemeToggle;
