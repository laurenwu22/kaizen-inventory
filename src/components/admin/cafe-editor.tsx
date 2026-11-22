"use client";

// New cafe form: name, plus people from other cafes with a role at the new one.
import { useActionState, useEffect, useState } from "react";
import type { FormState } from "@/lib/admin/validation";
import { SearchInput } from "@/components/search-input";
import { ui } from "@/components/ui";
import { FieldError, FormError, SubmitButton } from "./form-bits";
import { ModalButton } from "./modal-button";

type Role = "EMPLOYEE" | "ADMIN";
export type PersonOption = { id: string; name: string; where: string; isManager: boolean };

export function NewCafeModal({
  action,
  people,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  people: PersonOption[];
}) {
  return (
    <ModalButton label="+ Add cafe" title="Add cafe" buttonClassName={ui.primary}>
      {(close) => <CafeEditor action={action} people={people} onSaved={close} />}
    </ModalButton>
  );
}

function CafeEditor({
  action,
  people,
  onSaved,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  people: PersonOption[];
  onSaved: () => void;
}) {
  const [state, formAction] = useActionState(action, {});
  const [picked, setPicked] = useState<Record<string, Role>>({});
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (state.savedAt) onSaved();
  }, [state.savedAt, onSaved]);

  const q = query.trim().toLowerCase();
  const shown = q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  const toggle = (id: string) =>
    setPicked((m) => {
      const next = { ...m };
      if (next[id]) delete next[id];
      else next[id] = "EMPLOYEE";
      return next;
    });
  const count = Object.keys(picked).length;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div>
        <label className={ui.label} htmlFor="cafe-name">
          Cafe name
        </label>
        <input id="cafe-name" name="name" placeholder="Kaizen Labs" className={ui.input} autoComplete="off" />
        <FieldError state={state} name="name" />
      </div>

      <fieldset>
        <legend className={ui.label}>
          People to add{count > 0 ? ` · ${count} selected` : ""}
        </legend>
        <p className="mb-3 text-sm text-ink/55">Managers can already open every cafe, so they don&apos;t need to be added.</p>
        {people.length > 6 && (
          <div className="mb-3">
            <SearchInput value={query} onChange={setQuery} placeholder="Search by name" label="Search people" />
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {shown.map((p) => {
            const role = picked[p.id];
            return (
              <li key={p.id} className={`rounded-2xl p-3 ring-1 ${role ? "bg-white ring-ink/20" : "bg-cream/50 ring-ink/10"}`}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={!!role} onChange={() => toggle(p.id)} className="h-5 w-5 shrink-0 accent-[#23211e]" />
                  <span className="min-w-0">
                    <span className={`block font-semibold ${role ? "" : "text-ink/70"}`}>
                      {p.name}
                      {p.isManager && <span className="ml-2 text-xs font-semibold text-[#7a6535]">Manager</span>}
                    </span>
                    <span className="block truncate text-sm text-ink/50">{p.where}</span>
                  </span>
                </label>
                {role && (
                  <div className="mt-2 flex gap-2 pl-8" role="radiogroup" aria-label={`Role for ${p.name}`}>
                    {(["EMPLOYEE", "ADMIN"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={role === r}
                        onClick={() => setPicked((m) => ({ ...m, [p.id]: r }))}
                        className={`h-10 flex-1 rounded-full text-sm font-semibold ${
                          role === r ? "bg-ink text-white" : "bg-white text-ink/70 ring-1 ring-ink/20 active:bg-cream"
                        }`}
                      >
                        {r === "ADMIN" ? "Admin" : "Employee"}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
          {shown.length === 0 && <li className="text-sm text-ink/55">No one matches “{query}”.</li>}
        </ul>
        <input
          type="hidden"
          name="members"
          value={JSON.stringify(Object.entries(picked).map(([userId, role]) => ({ userId, role })))}
        />
        <FieldError state={state} name="members" />
      </fieldset>

      <FormError state={state} />
      <div className="flex items-center gap-3 border-t border-ink/10 pt-5">
        <SubmitButton>Create cafe</SubmitButton>
      </div>
    </form>
  );
}

