"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";
let fallback: Theme = "light";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("rewardly-theme-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("rewardly-theme-change", callback);
  };
}
function snapshot(): Theme {
  try { const saved = localStorage.getItem("rewardly-theme"); return saved === "light" || saved === "dark" ? saved : fallback; }
  catch { return fallback; }
}
export function useRewardTheme() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => "light" as Theme);
  function toggleTheme() {
    fallback = theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("rewardly-theme", fallback); } catch { /* Preferences remain optional. */ }
    window.dispatchEvent(new Event("rewardly-theme-change"));
  }
  return { theme, toggleTheme };
}
export function ThemeSurface({ children, className = "", themeOverride }: { children: ReactNode; className?: string; themeOverride?: Theme }) {
  const { theme } = useRewardTheme();
  return <div className={`reward-app ${className}`} data-theme={themeOverride || theme}>{children}</div>;
}
export function ThemeToggle() {
  const { theme, toggleTheme } = useRewardTheme();
  return <button type="button" className="rw-icon-button rw-theme-toggle" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} onClick={toggleTheme}>{theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}</button>;
}
