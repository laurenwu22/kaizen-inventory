"use client";

// New cafe form (name, plus people from other cafes with a role at the new
// one) and the delete-cafe confirmation.
import { useActionState, useEffect, useState } from "react";
import type { FormState } from "@/lib/admin/validation";
import { SearchInput } from "@/components/search-input";
import { ui } from "@/components/ui";
import { Spinner } from "@/components/spinner";
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
    <ModalButton label="+ New cafe" title="New cafe" buttonClassName={ui.primary}>
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

/** "Delete" on a cafe row: a pop-up that spells out what goes with it. */
export function DeleteCafeModal({
  action,
  cafe,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  cafe: { name: string; people: number; sections: number; submissions: number; onlyCafeFor: string[] };
}) {
  return (
    <ModalButton
      label="Delete"
      title={`Delete ${cafe.name}?`}
      buttonClassName="h-9 shrink-0 rounded-full px-3 text-sm font-semibold text-red-700 ring-1 ring-red-200 active:bg-red-50"
    >
      {(close) => <DeleteCafeConfirm action={action} cafe={cafe} onCancel={close} />}
    </ModalButton>
  );
}

function DeleteCafeConfirm({
  action,
  cafe,
  onCancel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  cafe: { name: string; people: number; sections: number; submissions: number; onlyCafeFor: string[] };
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  useEffect(() => {
    if (state.savedAt) onCancel();
  }, [state.savedAt, onCancel]);
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p>This permanently deletes {cafe.name} and everything in it. It can&apos;t be undone.</p>
      <ul className="list-disc pl-5 text-sm text-ink/70">
        <li>
          {n(cafe.sections, "section", "sections")} and {cafe.sections === 1 ? "its" : "their"} items
        </li>
        <li>{n(cafe.submissions, "past submission", "past submissions")} (order history)</li>
        <li>{n(cafe.people, "person", "people")} removed from this cafe (their accounts stay)</li>
      </ul>
      {cafe.onlyCafeFor.length > 0 && (
        <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {cafe.onlyCafeFor.join(", ")} {cafe.onlyCafeFor.length === 1 ? "works" : "work"} only here and won&apos;t be able
          to sign in until added to another cafe.
        </p>
      )}
      {state.error && <p className={ui.error}>{state.error}</p>}
      <div className="flex items-center gap-2 border-t border-ink/10 pt-4">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 min-w-36 items-center justify-center rounded-full bg-red-700 px-5 text-sm font-semibold text-white active:bg-red-800 disabled:opacity-40"
        >
          {pending ? <Spinner /> : "Yes, delete cafe"}
        </button>
        <button type="button" onClick={onCancel} className="h-11 px-3 text-sm font-semibold text-ink/60">
          Cancel
        </button>
      </div>
    </form>
  );
}
