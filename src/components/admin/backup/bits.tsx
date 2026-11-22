"use client";

// Small shared pieces for the Backup & transfer panels.
import { ui } from "@/components/ui";

export function CheckRow({
  checked,
  onChange,
  disabled,
  label,
  note,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  note?: string;
}) {
  return (
    <label
      className={`flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2 ring-1 ${
        checked ? "bg-white ring-ink/20" : "bg-cream/50 ring-ink/10"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-[#23211e]"
      />
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        {note && <span className="block text-sm text-ink/55">{note}</span>}
      </span>
    </label>
  );
}

export function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div aria-live="polite">
      <div className="mb-1 flex justify-between text-sm text-ink/60">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-cream" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gold transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Summary({ counts }: { counts: Record<string, number> }) {
  const label: Record<string, [string, string]> = {
    cafes: ["cafe", "cafes"],
    people: ["person", "people"],
    sections: ["section", "sections"],
    items: ["item", "items"],
    submissions: ["submission", "submissions"],
  };
  return (
    <p className="text-sm text-ink/70">
      {Object.entries(counts)
        .filter(([k]) => label[k])
        .map(([k, n]) => `${n} ${n === 1 ? label[k][0] : label[k][1]}`)
        .join(" · ")}
    </p>
  );
}

export const panel = `${ui.card} flex flex-col gap-5 p-4 sm:p-5`;
export const heading = "text-lg font-bold";
