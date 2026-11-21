"use client";

// Employee counting screen: today's sections, current stock with 0.5 steppers,
// automatic to-order amounts (editable), add-on-the-fly sections/items, and
// one Submit. Entries are kept on this phone until submitted.
//
// Items already submitted today are pre-filled with the latest submitted values
// (the "baseline"). Only items the person changes or newly counts are sent on
// Submit, so "counted by" stays accurate for everything else.
import { useActionState, useEffect, useMemo, useState } from "react";
import { submitInventory, type SubmitState } from "@/app/(app)/inventory/actions";
import type { CountItem, CountSection } from "@/lib/inventory";
import type { SharedAdditions, SubmittedEntry } from "@/lib/combined-data-types";
import { baselineEntry, isBlank, sameEntry, type Entry } from "@/lib/prefill";
import { computeAutoOrder, parseOrder, parseQty, stepCount } from "@/lib/order";
import { formatQty } from "@/lib/quantity";
import { formatLaTime } from "@/lib/time";
import { PendingButton } from "@/components/spinner";
import { CopyForSlack } from "@/components/copy-for-slack";
import { ui } from "@/components/ui";
import { SearchInput } from "@/components/search-input";

type Draft = {
  counts: Record<string, string>;
  orders: Record<string, string>;
  edited: Record<string, boolean>;
  /** Marked "Plenty": obviously above the minimum, not counted. */
  plenty: Record<string, boolean>;
  /** Items this person has changed; others show the baseline (today's latest submitted values). */
  touched: Record<string, boolean>;
  addedSections: string[];
  addedItems: string[];
};
const EMPTY: Draft = { counts: {}, orders: {}, edited: {}, plenty: {}, touched: {}, addedSections: [], addedItems: [] };

const DRAFT_PREFIX = "kaizen-draft:";

function readDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d: Draft = { ...EMPTY, ...JSON.parse(raw) };
    // Drafts saved before pre-filling existed: anything entered counts as touched.
    if (!JSON.parse(raw).touched) {
      for (const [k, v] of Object.entries(d.counts)) if (v.trim()) d.touched[k] = true;
      for (const [k, v] of Object.entries(d.plenty)) if (v) d.touched[k] = true;
      for (const [k, v] of Object.entries(d.edited)) if (v) d.touched[k] = true;
    }
    return d;
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
  baseline,
  shared,
}: {
  sheet: CountSection[];
  draftKey: string;
  /** Today's latest submitted entry per item, used to pre-fill. */
  baseline: Record<string, SubmittedEntry>;
  /** Sections/items others added to today's count and submitted. */
  shared: SharedAdditions;
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

  // What's on screen: scheduled sections, plus sections/items added for today,
  // either by this person (not yet submitted) or by anyone who has submitted.
  const sectionAdded = (id: string) => draft.addedSections.includes(id) || id in shared.sections;
  const itemAdded = (id: string) => draft.addedItems.includes(id) || id in shared.items;
  const visible = sheet
    .map((s) => {
      const whole = s.scheduled || sectionAdded(s.id);
      const items = whole ? s.items : s.items.filter((i) => itemAdded(i.id));
      const addedBy = shared.sections[s.id] ?? s.items.map((i) => shared.items[i.id]).find(Boolean);
      // Only this person's own, not-yet-shared adds can be removed.
      const removable = !s.scheduled && !(s.id in shared.sections) && !s.items.some((i) => i.id in shared.items);
      return { section: s, items, added: !s.scheduled, addedBy, removable };
    })
    .filter((v) => v.items.length > 0);
  const visibleIds = new Set(visible.flatMap((v) => v.items.map((i) => i.id)));
  const notScheduled = sheet.filter((s) => !s.scheduled && !sectionAdded(s.id));

  const update = (fn: (d: Draft) => Draft) => setDraft((d) => fn(d));
  const entryOf = (d: Draft, id: string): Entry =>
    d.touched[id]
      ? { count: d.counts[id] ?? "", order: d.orders[id] ?? "", edited: !!d.edited[id], plenty: !!d.plenty[id] }
      : baselineEntry(baseline[id]);
  /** Change one item's entry, starting from what's on screen (baseline or draft). */
  const change = (id: string, fn: (e: Entry) => Entry) =>
    update((d) => {
      const e = fn(entryOf(d, id));
      return {
        ...d,
        touched: { ...d.touched, [id]: true },
        counts: { ...d.counts, [id]: e.count },
        orders: { ...d.orders, [id]: e.order },
        edited: { ...d.edited, [id]: e.edited },
        plenty: { ...d.plenty, [id]: e.plenty },
      };
    });
  const setCount = (id: string, value: string) => change(id, (e) => ({ ...e, count: value }));
  const setOrder = (id: string, value: string) => change(id, (e) => ({ ...e, order: value, edited: true }));
  const resetOrder = (id: string) => change(id, (e) => ({ ...e, edited: false }));
  // Marking Plenty clears any count or edited order for that item.
  const togglePlenty = (id: string) =>
    change(id, (e) => (e.plenty ? { ...e, plenty: false, count: "" } : { ...e, plenty: true, count: "", edited: false }));
  const isChanged = (id: string) => !!draft.touched[id] && !sameEntry(entryOf(draft, id), baselineEntry(baseline[id]));
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
        plenty: strip(d.plenty),
        touched: strip(d.touched),
        addedSections: d.addedSections.filter((s) => s !== sectionId),
        addedItems: d.addedItems.filter((i) => !ids.has(i)),
      };
    });

  // Lines to submit: visible items this person changed or newly counted.
  // Pre-filled items left as they are aren't re-sent.
  const lines: { itemId: string; currentCount: string; finalOrder: string; manuallyEdited: boolean; plenty: boolean }[] = [];
  const invalid: string[] = [];
  let uncounted = 0;
  for (const id of visibleIds) {
    const e = entryOf(draft, id);
    if (isBlank(e)) {
      // Items in sections already submitted today aren't "missing".
      if (!itemsById.get(id)!.section.submittedToday) uncounted++;
      continue;
    }
    if (!isChanged(id)) continue;
    if (e.plenty) {
      lines.push({ itemId: id, currentCount: "", finalOrder: "0", manuallyEdited: false, plenty: true });
      continue;
    }
    const raw = e.count.trim();
    const current = parseQty(raw);
    const { item } = itemsById.get(id)!;
    if (current === null) {
      invalid.push(item.name);
      continue;
    }
    const auto = computeAutoOrder(current, item.min, item.max);
    const orderRaw = e.edited ? e.order : String(auto);
    if (e.edited && parseOrder(orderRaw) === null) invalid.push(item.name);
    lines.push({ itemId: id, currentCount: raw, finalOrder: orderRaw, manuallyEdited: e.edited, plenty: false });
  }

  return (
    <div className="flex flex-col gap-4">
      {visible.length === 0 ? (
        <div className={`${ui.card} p-6 text-ink/70`}>
          Nothing is scheduled to be counted today. Add a section or search for an item below.
        </div>
      ) : (
        visible.map(({ section, items, added, addedBy, removable }) => {
          const counted = items.filter((i) => !isBlank(entryOf(draft, i.id))).length;
          const changedHere = items.some((i) => isChanged(i.id));
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
                {added && (
                  <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-[#6b5830]">
                    {addedBy ? `Added by ${addedBy}` : "Added"}
                  </span>
                )}
                {section.submittedToday && !changedHere ? (
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
                        count={entryOf(draft, item.id).count}
                        edited={entryOf(draft, item.id).edited}
                        plenty={entryOf(draft, item.id).plenty}
                        onPlenty={() => togglePlenty(item.id)}
                        manualOrder={entryOf(draft, item.id).order}
                        source={baseline[item.id]}
                        changed={isChanged(item.id)}
                        onCount={(v) => setCount(item.id, v)}
                        onOrder={(v) => setOrder(item.id, v)}
                        onReset={() => resetOrder(item.id)}
                      />
                    ))}
                  </ul>
                  {added && removable && (
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
        <input
          type="hidden"
          name="added"
          value={JSON.stringify({ sections: draft.addedSections, items: draft.addedItems })}
        />
        <p className="text-center text-sm text-ink/60">
          {lines.length} to submit
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
  plenty,
  onPlenty,
  manualOrder,
  source,
  changed,
  onCount,
  onOrder,
  onReset,
}: {
  item: CountItem;
  count: string;
  edited: boolean;
  plenty: boolean;
  onPlenty: () => void;
  manualOrder: string;
  /** Today's latest submitted entry, if any (shown as "Jo · 9:14 AM"). */
  source?: SubmittedEntry;
  changed: boolean;
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
        <span className="min-w-0 truncate">
          <span className="font-semibold">{item.name}</span>
          {changed && source ? (
            <span className="ml-2 text-xs font-semibold text-[#7a6535]">Edited</span>
          ) : (
            source && (
              <span className="ml-2 text-xs text-ink/45">
                {source.by} · {formatLaTime(new Date(source.at))}
              </span>
            )
          )}
        </span>
        <span className="shrink-0 text-sm text-ink/60">
          {formatQty(item.min)}–{formatQty(item.max)} {item.unit}
        </span>
      </div>
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-[3]">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="block text-xs font-semibold text-ink/55" htmlFor={`count-${item.id}`}>
              Current stock
            </label>
            <button
              type="button"
              onClick={onPlenty}
              aria-pressed={plenty}
              title="Obviously above the minimum: skip counting"
              className={`flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold ${
                plenty ? "bg-[#e3eee4] text-[#3f6b47] ring-1 ring-[#9fc2a5]" : "text-ink/60 ring-1 ring-ink/15 active:bg-cream"
              }`}
            >
              {plenty && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              Plenty
            </button>
          </div>
          {plenty ? (
            <button
              type="button"
              onClick={onPlenty}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-[#eef5ef] text-sm font-semibold text-[#3f6b47] ring-1 ring-[#cfe1d2]"
            >
              Plenty · tap to count
            </button>
          ) : (
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
          )}
        </div>
        <div className="min-w-0 flex-[2]">
          <div className="mb-1.5 flex h-8 items-center justify-between gap-2">
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
            disabled={current === null || plenty}
            value={plenty ? "0" : orderValue}
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
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="search items to add to inventory"
        label="Search items to add to inventory"
      />
      {q && (
        <ul className={`${ui.card} mt-1 divide-y divide-ink/10`}>
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
