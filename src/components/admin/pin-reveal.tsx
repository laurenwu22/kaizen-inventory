"use client";

import { useState } from "react";

/** A PIN shown as dots until "Show" is tapped. */
export function PinReveal({ pin, className = "" }: { pin: string; className?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="font-mono tracking-widest" aria-label={shown ? `PIN ${pin.split("").join(" ")}` : "PIN hidden"}>
        {shown ? pin : "••••"}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShown((s) => !s);
        }}
        className="h-9 rounded-full px-2.5 text-xs font-semibold text-ink/60 ring-1 ring-ink/15 active:bg-cream"
      >
        {shown ? "Hide" : "Show"}
      </button>
    </span>
  );
}
