"use client";

// New section: start blank, or duplicate a section from this cafe or any other
// cafe the user belongs to. Duplicating fills in the name, color and days and
// copies the items with their units and min/max amounts.
import { useState } from "react";
import type { FormState } from "@/lib/admin/validation";
import { ui } from "@/components/ui";
import { SectionForm } from "./forms";

export type SourceSection = {
  id: string;
  name: string;
  color: string;
  days: number[];
  items: number;
};
export type SourceCafe = { id: string; name: string; isCurrent: boolean; sections: SourceSection[] };

export function NewSectionForm({
  action,
  cafes,
  takenNames,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  /** Cafes to duplicate from, current cafe first. */
  cafes: SourceCafe[];
  /** Section names already used at this cafe (lowercase). */
  takenNames: string[];
}) {
  const [mode, setMode] = useState<"blank" | "copy">("blank");
  const [sourceId, setSourceId] = useState("");
  const hasSources = cafes.some((c) => c.sections.length > 0);
  const found = cafes.flatMap((c) => c.sections.map((s) => ({ cafe: c, section: s }))).find((x) => x.section.id === sourceId);
  const source = mode === "copy" ? found : undefined;

  let defaults: { name: string; color: string; days: number[] } | undefined;
  if (source) {
    const s = source.section;
    const name = takenNames.includes(s.name.toLowerCase()) ? `${s.name} (copy)` : s.name;
    defaults = { name, color: s.color, days: s.days };
  }

  return (
    <div className="flex flex-col gap-5">
      {hasSources && (
        <div className="flex gap-2" role="radiogroup" aria-label="How to start">
          {(
            [
              ["blank", "Start blank"],
              ["copy", "Duplicate a section"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={`h-10 flex-1 rounded-full text-sm font-semibold ${
                mode === value ? "bg-ink text-white" : "bg-white text-ink/70 ring-1 ring-ink/20 active:bg-cream"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {mode === "copy" && (
        <div>
          <label className={ui.label} htmlFor="copy-from">
            Section to duplicate
          </label>
          <select
            id="copy-from"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className={`${ui.input} pr-3`}
          >
            <option value="">Choose a section…</option>
            {cafes
              .filter((c) => c.sections.length > 0)
              .map((c) => (
                <optgroup key={c.id} label={c.isCurrent ? `${c.name} (this cafe)` : c.name}>
                  {c.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.items} {s.items === 1 ? "item" : "items"}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
          {source && (
            <p className="mt-2 text-sm text-ink/60">
              Copies {source.section.items} {source.section.items === 1 ? "item" : "items"} from {source.section.name}
              {source.cafe.isCurrent ? "" : ` at ${source.cafe.name}`} with their units and min/max amounts, including
              custom daily amounts. One-time dates aren&apos;t copied. You can change anything after.
            </p>
          )}
        </div>
      )}

      {(mode === "blank" || source) && (
        <SectionForm
          key={source?.section.id ?? "blank"}
          action={action}
          defaults={defaults}
          submitLabel={source ? "Create copy" : "Create section"}
        >
          {source && <input type="hidden" name="copyFrom" value={source.section.id} />}
        </SectionForm>
      )}
    </div>
  );
}
