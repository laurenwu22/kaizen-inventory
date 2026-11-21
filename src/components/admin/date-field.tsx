"use client";

import { useState } from "react";
import { formatYmd } from "@/lib/time";
import { ui } from "@/components/ui";

/**
 * A date field that looks like one: "Choose a date" with a calendar icon, and
 * tapping anywhere on it opens the phone's date picker. The real <input
 * type="date"> sits invisibly on top so the native picker is used.
 * Controlled (value + onChange) or uncontrolled (name + defaultValue).
 */
export function DateField({
  id,
  name,
  value,
  defaultValue = "",
  onChange,
  min,
  label = "Date",
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (ymd: string) => void;
  min?: string;
  label?: string;
}) {
  const [own, setOwn] = useState(defaultValue);
  const current = value ?? own;
  return (
    <div className="relative">
      <div className={`${ui.input} pointer-events-none flex items-center justify-between gap-3`} aria-hidden>
        <span className={current ? "font-medium" : "text-ink/40"}>{current ? formatYmd(current) : "Choose a date"}</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 text-ink/55">
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      <input
        id={id}
        name={name}
        type="date"
        min={min}
        aria-label={label}
        value={current}
        onChange={(e) => {
          setOwn(e.target.value);
          onChange?.(e.target.value);
        }}
        onClick={(e) => {
          // Desktop browsers only open the picker from their small icon; open it from anywhere.
          try {
            e.currentTarget.showPicker?.();
          } catch {}
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}
