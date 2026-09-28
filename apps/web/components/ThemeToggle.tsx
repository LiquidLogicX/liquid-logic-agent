"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
  try {
    localStorage.setItem("llx-theme", theme);
  } catch {
    /* ignore */
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("llx-theme") as Theme | null;
      if (stored === "light" || stored === "dark" || stored === "system") {
        setTheme(stored);
        applyTheme(stored);
      }
    } catch {
      /* ignore */
    }
  }, []);

  function cycle() {
    const next: Theme =
      theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    applyTheme(next);
  }

  const label =
    theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      aria-label={`Color theme: ${label}. Click to change.`}
      title={`Theme: ${label}`}
    >
      {label}
    </button>
  );
}
