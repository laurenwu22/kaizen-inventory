"use client";

// Employee counting screen: today's sections, current stock with 0.5 steppers,
// automatic to-order amounts (editable), add-on-the-fly sections/items, and
// one Submit. Entries are kept on this phone until submitted.
import { useActionState, useEffect, useMemo, useState } from "react";
import { submitInventory, type SubmitState } from "@/app/(app)/inventory/actions";
import type { CountItem, CountSection } from "@/lib/inventory";
import { computeAutoOrder, parseOrder, parseQty, stepCount } from "@/lib/order";
import { formatQty } from "@/lib/quantity";
import { formatLaTime } from "@/lib/time";
import { PendingButton } from "@/components/spinner";
import { CopyForSlack } from "@/components/copy-for-slack";
import { ui } from "@/components/ui";

type Draft = {
  counts: Record<string, string>;
  orders: Record<string, string>;
  edited: Record<string, boolean>;
  addedSections: string[];
  addedItems: string[];
};
const EMPTY: Draft = { counts: {}, orders: {}, edited: {}, addedSections: [], addedItems: [] };
const DRAFT_PREFIX = "kaizen-draft:";

function readDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}
function writeDraft(key: string, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch {
    // Private browsing or storage full: counting still works, just isn't saved.
  }
}

export function CountForm({
  sheet,
  draftKey,
  slackText,
}: {
  sheet: CountSection[];
  draftKey: string;
  /** Today's combined order as Slack text, once anyone has submitted today. */
  slackText: string | null;
}) {
  const [state, formAction] = useActionState<SubmitState, FormData>(submitInventory, {});
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Sections fully counted in today's submissions start collapsed. When a new
  // submit completes more sections, collapse those too (adjusting state while
  // rendering, as React recommends for reacting to changed props).
  const submittedKey = sheet
    .filter((s) => s.submittedToday)
    .map((s) => s.id)
    .join(",");
  const [seenSubmitted, setSeenSubmitted] = useState<string | null>(null);
  if (submittedKey !== seenSubmitted) {
    const before = new Set((seenSubmitted ?? "").split(",").filter(Boolean));
    const newlyDone = submittedKey.split(",").filter((id) => id && !before.has(id));
    setSeenSubmitted(submittedKey);
    if (newlyDone.length) setCollapsed((c) => ({ ...c, ...Object.fromEntries(newlyDone.map((id) => [id, true])) }));
  }

  // Restore entries saved on this phone; drop drafts from earlier days.
  useEffect(() => {
    try {
      const scope = draftKey.slice(0, draftKey.lastIndexOf(":") + 1);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(DRAFT_PREFIX) && k.startsWith(scope) && k !== draftKey) localStorage.removeItem(k);
      }
    } catch {}
    const saved = readDraft(draftKey);
    if (saved) setDraft(saved); // eslint-disable-line react-hooks/set-state-in-effect -- restoring from storage after mount
    setLoaded(true);
  }, [draftKey]);

  useEffect(() => {
    if (loaded) writeDraft(draftKey, draft);
  }, [draft, draftKey, loaded]);

  // A successful submit clears this phone's draft.
  const submittedAt = state.submitted?.at ?? null;
  useEffect(() => {
    if (!submittedAt) return;
    writeDraft(draftKey, null);
    setDraft(EMPTY); // eslint-disable-line react-hooks/set-state-in-effect -- reset after a server submit
  }, [submittedAt, draftKey]);

  const itemsById = useMemo(() => {
    const m = new Map<string, { item: CountItem; section: CountSection }>();
    for (const s of sheet) for (const i of s.items) m.set(i.id, { item: i, section: s });
    return m;
  }, [sheet]);

  // What's on screen: scheduled + added sections in full, plus individually added items.
  const visible = sheet
    .map((s) => {
      const whole = s.scheduled || draft.addedSections.includes(s.id);
      const items = whole ? s.items : s.items.filter((i) => draft.addedItems.includes(i.id));
      return { section: s, items, added: !s.scheduled };
    })
    .filter((v) => v.items.length > 0);
  const visibleIds = new Set(visible.flatMap((v) => v.items.map((i) => i.id)));
  const notScheduled = sheet.filter((s) => !s.scheduled && !draft.addedSections.includes(s.id));

  const update = (fn: (d: Draft) => Draft) => setDraft((d) => fn(d));
  const setCount = (id: string, value: string) => update((d) => ({ ...d, counts: { ...d.counts, [id]: value } }));
  const setOrder = (id: string, value: string) =>
    update((d) => ({ ...d, orders: { ...d.orders, [id]: value }, edited: { ...d.edited, [id]: true } }));
  const resetOrder = (id: string) => update((d) => ({ ...d, edited: { ...d.edited, [id]: false } }));
  const addSection = (id: string) => update((d) => ({ ...d, addedSections: [...d.addedSections, id] }));
  const addItem = (id: string) => update((d) => ({ ...d, addedItems: [...d.addedItems, id] }));
  const removeAdded = (sectionId: string) =>
    update((d) => {
      const ids = new Set(sheet.find((s) => s.id === sectionId)?.items.map((i) => i.id));
      const strip = <T,>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([k]) => !ids.has(k)));
      return {
        counts: strip(d.counts),
        orders: strip(d.orders),
        edited: strip(d.edited),
        addedSections: d.addedSections.filter((s) => s !== sectionId),
        addedItems: d.addedItems.filter((i) => !ids.has(i)),
      };
    });

  // Lines to submit: every visible item with a count.
  const lines: { itemId: string; currentCount: string; finalOrder: string; manuallyEdited: boolean }[] = [];
  const invalid: string[] = [];
  let uncounted = 0;
  for (const id of visibleIds) {
    const raw = draft.counts[id]?.trim() ?? "";
    if (!raw) {
      // Items in sections already submitted today aren't "missing".
      if (!itemsById.get(id)!.section.submittedToday) uncounted++;
      continue;
    }
    const current = parseQty(raw);
    const { item } = itemsById.get(id)!;
    if (current === null) {
      invalid.push(item.name);
      continue;
    }
    const edited = !!draft.edited[id];
    const auto = computeAutoOrder(current, item.min, item.max);
    const orderRaw = edited ? (draft.orders[id] ?? "") : String(auto);
    if (edited && parseOrder(orderRaw) === null) invalid.push(item.name);
    lines.push({ itemId: id, currentCount: raw, finalOrder: orderRaw, manuallyEdited: edited });
  }

  return (
    <div className="flex flex-col gap-4">
      {visible.length === 0 ? (
        <div className={`${ui.card} p-6 text-ink/70`}>
          Nothing is scheduled to be counted today. Add a section or search for an item below.
        </div>
      ) : (
        visible.map(({ section, items, added }) => {
          const counted = items.filter((i) => draft.counts[i.id]?.trim()).length;
          const isCollapsed = !!collapsed[section.id];
          return (
            <section key={section.id} className={`${ui.card} overflow-hidden`}>
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [section.id]: !isCollapsed }))}
                aria-expanded={!isCollapsed}
                className="flex min-h-14 w-full items-center gap-3 px-4 text-left active:bg-cream"
              >
                <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: section.color }} />
                <span className="min-w-0 flex-1 truncate text-lg font-bold">{section.name}</span>
                {added && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-[#6b5830]">Added</span>}
                {section.submittedToday && counted === 0 ? (
                  <span className="flex items-center gap-1 text-sm font-semibold text-[#4d7a55]">
                    Submitted
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                ) : (
                  <span className={`text-sm font-medium ${counted === items.length ? "text-[#4d7a55]" : "text-ink/55"}`}>
                    {counted}/{items.length}
                  </span>
                )}
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                  className={`shrink-0 text-ink/50 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                >
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {!isCollapsed && (
                <>
                  <ul className="divide-y divide-ink/10 border-t border-ink/10">
                    {items.map((item) => (
                      <CountRow
                        key={item.id}
                        item={item}
                        count={draft.counts[item.id] ?? ""}
                        edited={!!draft.edited[item.id]}
                        manualOrder={draft.orders[item.id] ?? ""}
                        onCount={(v) => setCount(item.id, v)}
                        onOrder={(v) => setOrder(item.id, v)}
                        onReset={() => resetOrder(item.id)}
                      />
                    ))}
                  </ul>
                  {added && (
                    <div className="border-t border-ink/10 px-4 py-2 text-right">
                      <button type="button" onClick={() => removeAdded(section.id)} className="h-10 text-sm font-semibold text-ink/55 underline">
                        Remove from today&apos;s count
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          );
        })
      )}

      <form action={formAction} className="flex flex-col items-stretch gap-2 pt-2">
        <input type="hidden" name="lines" value={JSON.stringify(lines)} />
        <p className="text-center text-sm text-ink/60">
          {lines.length} counted
          {uncounted > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-[#7a6535]">
                {uncounted} item{uncounted === 1 ? "" : "s"} not counted
              </span>
            </>
          )}
        </p>
        {invalid.length > 0 && <p className={`${ui.error} text-center`}>Check the numbers for {invalid.join(", ")}.</p>}
        {state.error && <p className={`${ui.error} text-center`}>{state.error}</p>}
        <PendingButton className={`${ui.primary} h-14 w-full text-lg`} disabled={lines.length === 0 || invalid.length > 0}>
          Submit
        </PendingButton>
        {state.submitted && lines.length === 0 && (
          <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-[#4d7a55]" role="status">
            Submitted at {formatLaTime(new Date(state.submitted.at))}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </p>
        )}
        {slackText && <CopyForSlack text={slackText} className="mt-1" />}
      </form>

      <AddMore sheet={sheet} notScheduled={notScheduled} visibleIds={visibleIds} onAddSection={addSection} onAddItem={addItem} />
    </div>
  );
}

function CountRow({
  item,
  count,
  edited,
  manualOrder,
  onCount,
  onOrder,
  onReset,
}: {
  item: CountItem;
  count: string;
  edited: boolean;
  manualOrder: string;
  onCount: (v: string) => void;
  onOrder: (v: string) => void;
  onReset: () => void;
}) {
  const current = count.trim() ? parseQty(count) : null;
  const countInvalid = count.trim() !== "" && current === null;
  const auto = current === null ? null : computeAutoOrder(current, item.min, item.max);
  const orderValue = edited ? manualOrder : auto === null ? "" : formatQty(auto);
  const orderInvalid = edited && parseOrder(manualOrder) === null;
  const inputBase =
    "h-12 w-full min-w-0 rounded-xl bg-white text-center text-lg font-semibold text-ink ring-1 outline-none focus:ring-2 focus:ring-gold";

  return (
    <li className="px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-semibold">{item.name}</span>
        <span className="shrink-0 text-sm text-ink/60">
          {formatQty(item.min)}–{formatQty(item.max)} {item.unit}
        </span>
      </div>
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-[3]">
          <label className="mb-1 block text-xs font-semibold text-ink/55" htmlFor={`count-${item.id}`}>
            Current stock
          </label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onCount(stepCount(count, -1))}
              aria-label={`Decrease ${item.name}`}
              className="h-12 w-12 shrink-0 rounded-xl bg-cream text-2xl font-medium active:bg-sand"
            >
              −
            </button>
            <input
              id={`count-${item.id}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="–"
              value={count}
              onChange={(e) => onCount(e.target.value)}
              className={`${inputBase} ${countInvalid ? "ring-2 ring-red-500" : "ring-ink/20"}`}
            />
            <button
              type="button"
              onClick={() => onCount(stepCount(count, 1))}
              aria-label={`Increase ${item.name}`}
              className="h-12 w-12 shrink-0 rounded-xl bg-cream text-2xl font-medium active:bg-sand"
            >
              +
            </button>
          </div>
        </div>
        <div className="min-w-0 flex-[2]">
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="block text-xs font-semibold text-ink/55" htmlFor={`order-${item.id}`}>
              To order
            </label>
            {edited && (
              <button type="button" onClick={onReset} className="text-xs font-semibold text-[#7a6535] underline">
                Reset
              </button>
            )}
          </div>
          <input
            id={`order-${item.id}`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="–"
            disabled={current === null}
            value={orderValue}
            onChange={(e) => onOrder(e.target.value)}
            className={`${inputBase} disabled:bg-cream/60 disabled:text-ink/30 ${
              orderInvalid ? "ring-2 ring-red-500" : edited ? "ring-2 ring-gold" : "ring-ink/20"
            } ${!edited && auto ? "text-[#7a6535]" : ""}`}
          />
        </div>
      </div>
      {countInvalid && <p className={ui.error}>Enter a number like 2 or 0.5</p>}
      {orderInvalid && <p className={ui.error}>To order must be a whole number</p>}
    </li>
  );
}

function AddMore({
  sheet,
  notScheduled,
  visibleIds,
  onAddSection,
  onAddItem,
}: {
  sheet: CountSection[];
  notScheduled: CountSection[];
  visibleIds: Set<string>;
  onAddSection: (id: string) => void;
  onAddItem: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const results = q
    ? sheet
        .flatMap((s) => s.items.map((i) => ({ item: i, section: s })))
        .filter(({ item }) => !visibleIds.has(item.id) && item.name.toLowerCase().includes(q))
        .slice(0, 8)
    : [];

  if (notScheduled.length === 0 && sheet.every((s) => s.items.every((i) => visibleIds.has(i.id)))) return null;

  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-ink/10 pt-6">
      <h2 className={ui.sectionTitle}>Add items</h2>
      <div className="relative">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink/40">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search items to add to inventory"
          aria-label="Search items to add to inventory"
          className={`${ui.input} pl-10`}
        />
      </div>
      {q && (
        <ul className={`${ui.card} divide-y divide-ink/10`}>
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-ink/55">No matching items to add.</li>
          ) : (
            results.map(({ item, section }) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{item.name}</span>
                  <span className="block truncate text-sm text-ink/55">{section.name}</span>
                </span>
                <button
                  type="button"
                  className={ui.secondary}
                  onClick={() => {
                    onAddItem(item.id);
                    setQuery("");
                  }}
                >
                  Add
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      {notScheduled.length > 0 && <h2 className={`${ui.sectionTitle} mt-4`}>Add sections</h2>}
      {notScheduled.map((s) => (
        <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-cream/60 p-3 pl-4 ring-1 ring-ink/5">
          <span aria-hidden className="h-3 w-3 shrink-0 rounded-full opacity-60" style={{ backgroundColor: s.color }} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-ink/55">{s.name}</span>
            <span className="block text-sm text-ink/45">
              Not scheduled today · {s.items.length} item{s.items.length === 1 ? "" : "s"}
            </span>
          </span>
          <button type="button" className={ui.secondary} onClick={() => onAddSection(s.id)}>
            Add
          </button>
        </div>
      ))}
    </div>
  );
}
