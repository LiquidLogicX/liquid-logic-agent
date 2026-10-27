"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("llx-theme", theme);
  } catch {
    /* ignore */
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("llx-theme") as Theme | null;
      if (stored === "light") {
        setTheme("light");
      }
    } catch {
      /* ignore */
    }
    // In case the boot script was skipped (some in-app browsers), set the theme here too.
    if (document.documentElement.getAttribute("data-theme") !== "light") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  function cycle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
  }

  const label = theme === "light" ? "Light" : "Dark";

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
