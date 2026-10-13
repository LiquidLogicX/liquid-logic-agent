"use client";

import { useEffect, useId, useRef, useState } from "react";

type Item = { href: string; label: string };

export function NavMoreMenu({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="nav-more" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="nav-more-btn"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="More pages"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="nav-more-label">More ▾</span>
        <span className="nav-more-icon" aria-hidden="true">
          ☰
        </span>
      </button>
      <ul id={menuId} className="nav-more-menu" hidden={!open}>
        {items.map((item) => (
          <li key={item.href}>
            <a href={item.href} onClick={() => setOpen(false)}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
