"use client";

// Item editor used both in the "Add item" pop-up and on the item page.
// Details, default amounts, custom daily amounts and one-time dates are edited
// locally and saved together with one Save button.
import { useActionState, useEffect, useId, useState } from "react";
import { checkAmounts, type FormState } from "@/lib/admin/validation";
import { formatQty, WEEK_ORDER, WEEKDAY_SHORT } from "@/lib/quantity";
import { formatYmd } from "@/lib/time";
import { ui } from "@/components/ui";
import { FieldError, FormError, SubmitButton } from "./form-bits";

type Amounts = { min: string; max: string };
export type ItemEditorValues = {
  name: string;
  unit: string;
  min: string;
  max: string;
  weekdays: { day: number; min: string; max: string }[];
  dates: { date: string; min: string; max: string }[];
};

const EMPTY: ItemEditorValues = { name: "", unit: "", min: "", max: "", weekdays: [], dates: [] };

export function ItemEditor({
  action,
  units,
  initial = EMPTY,
  today,
  submitLabel,
  onSaved,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  units: string[];
  initial?: ItemEditorValues;
  today: string;
  submitLabel: string;
  onSaved?: () => void;
}) {
  const [state, formAction] = useActionState(action, {});
  const [unit, setUnit] = useState(initial.unit);
  const [weekdays, setWeekdays] = useState<Map<number, Amounts>>(
    new Map(initial.weekdays.map((w) => [w.day, { min: w.min, max: w.max }])),
  );
  const [dates, setDates] = useState(initial.dates);
  // Custom days and dates change locally first; remind the admin to Save.
  const [dirty, setDirty] = useState(false);
  const changeWeekdays = (m: Map<number, Amounts>) => {
    setWeekdays(m);
    setDirty(true);
  };
  const changeDates = (d: typeof dates) => {
    setDates(d);
    setDirty(true);
  };

  useEffect(() => {
    if (!state.savedAt) return;
    setDirty(false); // eslint-disable-line react-hooks/set-state-in-effect -- reset after a server save
    onSaved?.();
  }, [state.savedAt, onSaved]);

  const unitText = unit.trim();
  const unitLabel = unitText ? ` (${unitText})` : "";

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col gap-5">
        <div>
          <label className={ui.label} htmlFor="item-name">
            Item name
          </label>
          <input
            id="item-name"
            name="name"
            defaultValue={initial.name}
            placeholder="e.g. Bananas"
            className={ui.input}
            autoComplete="off"
          />
          <FieldError state={state} name="name" />
        </div>
        <div>
          <label className={ui.label} htmlFor="item-unit">
            Unit
          </label>
          <input
            id="item-unit"
            name="unit"
            list="unit-suggestions"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="e.g. bunches"
            className={ui.input}
            autoComplete="off"
          />
          <datalist id="unit-suggestions">
            {units.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <FieldError state={state} name="unit" />
        </div>
        <fieldset>
          <legend className={ui.label}>Default amounts{unitLabel}</legend>
          <div className="flex gap-3">
            <AmountField name="min" label="Min" defaultValue={initial.min} error={state.fieldErrors?.min} />
            <AmountField name="max" label="Max" defaultValue={initial.max} error={state.fieldErrors?.max} />
          </div>
        </fieldset>
      </div>

      <CustomDays weekdays={weekdays} onChange={changeWeekdays} unitLabel={unitLabel} unitText={unitText} />
      <FieldError state={state} name="weekdays" />

      <OneTimeDates dates={dates} onChange={changeDates} unitLabel={unitLabel} unitText={unitText} today={today} />
      <FieldError state={state} name="dates" />

      <input
        type="hidden"
        name="weekdays"
        value={JSON.stringify([...weekdays].map(([day, a]) => ({ day, min: a.min, max: a.max })))}
      />
      <input type="hidden" name="dates" value={JSON.stringify(dates)} />

      <FormError state={state} />
      <div className="flex items-center gap-3 border-t border-ink/10 pt-5">
        <SubmitButton>{submitLabel}</SubmitButton>
        {dirty ? (
          <span className="text-sm font-semibold text-[#7a6535]">Unsaved changes</span>
        ) : (
          state.ok && !onSaved && <span className="text-sm font-medium text-ink/60">Saved</span>
        )}
      </div>
    </form>
  );
}

function AmountField({
  name,
  label,
  defaultValue,
  value,
  onChange,
  error,
}: {
  name?: string;
  label: string;
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0 flex-1">
      <label className={ui.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        className={ui.input}
        {...(onChange ? { value: value ?? "", onChange: (e) => onChange(e.target.value) } : { defaultValue })}
      />
      {error && <p className={ui.error}>{error}</p>}
    </div>
  );
}

const range = (a: Amounts) => `${formatQty(Number(a.min))}–${formatQty(Number(a.max))}`;

// --------------------------------------------------- Custom daily amounts

function CustomDays({
  weekdays,
  onChange,
  unitLabel,
  unitText,
}: {
  weekdays: Map<number, Amounts>;
  onChange: (m: Map<number, Amounts>) => void;
  unitLabel: string;
  unitText: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [amounts, setAmounts] = useState<Amounts>({ min: "", max: "" });
  const [error, setError] = useState<string | null>(null);

  const openFor = (days: number[]) => {
    const first = weekdays.get(days[0]);
    setSelected(new Set(days));
    setAmounts(first ? { ...first } : { min: "", max: "" });
    setError(null);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setSelected(new Set());
    setError(null);
  };
  const toggle = (d: number) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  const apply = () => {
    if (selected.size === 0) return setError("Pick at least one day");
    const problem = checkAmounts(amounts);
    if (problem) return setError(problem);
    const next = new Map(weekdays);
    for (const d of selected) next.set(d, { min: amounts.min.trim(), max: amounts.max.trim() });
    onChange(next);
    close();
  };
  const useDefault = () => {
    const next = new Map(weekdays);
    for (const d of selected) next.delete(d);
    onChange(next);
    close();
  };

  const customDays = WEEK_ORDER.filter((d) => weekdays.has(d));

  return (
    <div>
      {customDays.length > 0 && (
        <div className="mb-3">
          <p className={ui.label}>Custom daily amounts</p>
          <div className="flex flex-wrap gap-2">
            {customDays.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => openFor([d])}
                className="h-11 rounded-full bg-gold/15 px-4 text-sm font-semibold text-[#6b5830] ring-1 ring-gold/40 active:bg-gold/25"
              >
                {WEEKDAY_SHORT[d]} · {range(weekdays.get(d)!)} {unitText}
              </button>
            ))}
          </div>
        </div>
      )}

      {!open ? (
        <button type="button" onClick={() => openFor([])} className={ui.secondary}>
          Customize daily amounts
        </button>
      ) : (
        <div className="rounded-2xl bg-cream/70 p-4">
          <p className="mb-3 font-semibold">Customize daily amounts</p>
          <div className="mb-4 flex gap-1.5" role="group" aria-label="Days">
            {WEEK_ORDER.map((d) => {
              const on = selected.has(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(d)}
                  className={`relative h-11 min-w-0 flex-1 rounded-full text-sm font-semibold ${
                    on ? "bg-ink text-white" : "bg-white text-ink/70 ring-1 ring-ink/20 active:bg-cream"
                  }`}
                >
                  {WEEKDAY_SHORT[d]}
                  {weekdays.has(d) && !on && (
                    <span className="absolute top-1 right-1.5 h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="mb-3 flex gap-3">
            <AmountField label={`Min${unitLabel}`} value={amounts.min} onChange={(v) => setAmounts((a) => ({ ...a, min: v }))} />
            <AmountField label={`Max${unitLabel}`} value={amounts.max} onChange={(v) => setAmounts((a) => ({ ...a, max: v }))} />
          </div>
          {error && <p className={`${ui.error} mb-3`}>{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={apply} className={ui.primary}>
              Apply
            </button>
            {[...selected].some((d) => weekdays.has(d)) && (
              <button type="button" onClick={useDefault} className={ui.secondary}>
                Use default
              </button>
            )}
            <button type="button" onClick={close} className="h-11 px-3 text-sm font-semibold text-ink/60">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------- One-time dates

type DateRow = { date: string; min: string; max: string };

function OneTimeDates({
  dates,
  onChange,
  unitLabel,
  unitText,
  today,
}: {
  dates: DateRow[];
  onChange: (d: DateRow[]) => void;
  unitLabel: string;
  unitText: string;
  today: string;
}) {
  // null = closed, "new" = adding, otherwise the date being edited
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<DateRow>({ date: "", min: "", max: "" });
  const [error, setError] = useState<string | null>(null);

  const open = (row: DateRow | null) => {
    setEditing(row ? row.date : "new");
    setDraft(row ? { ...row } : { date: "", min: "", max: "" });
    setError(null);
  };
  const close = () => {
    setEditing(null);
    setError(null);
  };
  const save = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return setError("Pick a date");
    if (draft.date < today) return setError("Pick today or a later date");
    if (editing === "new" && dates.some((d) => d.date === draft.date)) {
      return setError("That date is already listed. Tap it to change it.");
    }
    const problem = checkAmounts(draft);
    if (problem) return setError(problem);
    const row = { date: draft.date, min: draft.min.trim(), max: draft.max.trim() };
    const rest = dates.filter((d) => d.date !== editing && d.date !== row.date);
    onChange([...rest, row].sort((a, b) => a.date.localeCompare(b.date)));
    close();
  };
  const remove = () => {
    onChange(dates.filter((d) => d.date !== editing));
    close();
  };

  // Only rendered while adding or editing a date.
  const renderForm = () => (
    <div className="rounded-2xl bg-cream/70 p-4">
      {editing === "new" ? (
        <div className="mb-3">
          <label className={ui.label} htmlFor="one-time-date">
            Date
          </label>
          <input
            id="one-time-date"
            type="date"
            min={today}
            value={draft.date}
            onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            className={ui.input}
          />
        </div>
      ) : (
        <p className="mb-3 font-semibold">{draft.date ? formatYmd(draft.date) : ""}</p>
      )}
      <div className="mb-3 flex gap-3">
        <AmountField label={`Min${unitLabel}`} value={draft.min} onChange={(v) => setDraft((d) => ({ ...d, min: v }))} />
        <AmountField label={`Max${unitLabel}`} value={draft.max} onChange={(v) => setDraft((d) => ({ ...d, max: v }))} />
      </div>
      {error && <p className={`${ui.error} mb-3`}>{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} className={ui.primary}>
          {editing === "new" ? "Add" : "Update"}
        </button>
        {editing !== "new" && (
          <button type="button" onClick={remove} className="h-11 px-3 text-sm font-semibold text-red-700">
            Remove
          </button>
        )}
        <button type="button" onClick={close} className="h-11 px-3 text-sm font-semibold text-ink/60">
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink/80">One-time dates</p>
        {editing === null && (
          <button type="button" onClick={() => open(null)} className={ui.secondary}>
            + Add
          </button>
        )}
      </div>
      {dates.length === 0 && editing !== "new" && (
        <p className="text-sm text-ink/55">For events or holidays. These override the daily amounts.</p>
      )}
      <ul className="flex flex-col gap-2">
        {dates.map((d) =>
          editing === d.date ? (
            <li key={d.date}>{renderForm()}</li>
          ) : (
            <li key={d.date}>
              <button
                type="button"
                onClick={() => open(d)}
                disabled={editing !== null}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-white px-4 text-left ring-1 ring-ink/10 active:bg-cream disabled:opacity-50"
              >
                <span className="font-medium">{formatYmd(d.date)}</span>
                <span className="text-ink/70">
                  {range(d)} {unitText}
                </span>
              </button>
            </li>
          ),
        )}
      </ul>
      {editing === "new" && <div className="mt-2">{renderForm()}</div>}
    </div>
  );
}
