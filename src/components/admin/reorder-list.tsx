"use client";

// A list with ▲▼ reordering, used for sections and for items. A move shows
// instantly (optimistic), the rows slide to their new places, and the moved row
// glows briefly. The server saves in the background; if it fails, the list snaps
// back to the saved order.
import Link from "next/link";
import { startTransition, useEffect, useLayoutEffect, useOptimistic, useRef, useState } from "react";
import { LinkSpinner } from "@/components/spinner";
import { ui } from "@/components/ui";

export type ReorderRow = {
  id: string;
  /** Used in the ▲▼ buttons' accessible labels. */
  name: string;
  href: string;
  /** Row content (rendered on the server). */
  content: React.ReactNode;
};
type Move = { id: string; direction: "up" | "down" };

function applyMove(rows: ReorderRow[], { id, direction }: Move): ReorderRow[] {
  const i = rows.findIndex((r) => r.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return rows;
  const next = [...rows];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function ReorderList({
  rows: savedRows,
  moveAction,
  idField,
  variant = "cards",
}: {
  rows: ReorderRow[];
  /** Server action taking FormData with `idField` and "direction". */
  moveAction: (fd: FormData) => Promise<void>;
  idField: string;
  /** "cards": separate white cards (sections); "rows": rows inside a card (items). */
  variant?: "cards" | "rows";
}) {
  const [rows, addMove] = useOptimistic(savedRows, applyMove);
  const [glowId, setGlowId] = useState<string | null>(null);
  const items = useRef(new Map<string, HTMLLIElement>());
  const positionsBefore = useRef<Map<string, number> | null>(null);

  function move(id: string, direction: Move["direction"]) {
    // Remember where every card is, so we can animate from there (FLIP).
    positionsBefore.current = new Map([...items.current].map(([key, el]) => [key, el.getBoundingClientRect().top]));
    setGlowId(id);
    startTransition(async () => {
      addMove({ id, direction });
      const fd = new FormData();
      fd.set(idField, id);
      fd.set("direction", direction);
      await moveAction(fd);
    });
  }

  // After the order changes, slide each card from its old position to its new one.
  useLayoutEffect(() => {
    const before = positionsBefore.current;
    positionsBefore.current = null;
    if (!before || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const [id, el] of items.current) {
      const oldTop = before.get(id);
      if (oldTop === undefined) continue;
      const dy = oldTop - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], {
        duration: 300,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    }
  }, [rows]);

  useEffect(() => {
    if (!glowId) return;
    const t = setTimeout(() => setGlowId(null), 1500);
    return () => clearTimeout(t);
  }, [glowId]);

  return (
    <ul className={variant === "cards" ? "flex flex-col gap-3" : "-mx-2 flex flex-col gap-1"}>
      {rows.map((s, i) => (
        <li
          key={s.id}
          ref={(el) => {
            if (el) items.current.set(s.id, el);
            else items.current.delete(s.id);
          }}
          className={`relative flex items-center gap-3 transition-[box-shadow,background-color] duration-500 ${
            variant === "cards" ? "rounded-2xl p-3 pl-4 ring-1" : "rounded-xl px-2 py-1.5"
          } ${
            glowId === s.id
              ? "z-10 bg-[#fbf7ee] shadow-[0_0_0_3px_rgba(176,148,88,0.55)] ring-gold"
              : variant === "cards"
                ? "bg-white ring-ink/10"
                : "bg-white"
          }`}
        >
          <Link href={s.href} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 active:bg-cream">
            <span className="min-w-0 flex-1">{s.content}</span>
            <LinkSpinner />
          </Link>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              className={ui.iconButton}
              disabled={i === 0}
              onClick={() => move(s.id, "up")}
              aria-label={`Move ${s.name} up`}
            >
              ▲
            </button>
            <button
              type="button"
              className={ui.iconButton}
              disabled={i === rows.length - 1}
              onClick={() => move(s.id, "down")}
              aria-label={`Move ${s.name} down`}
            >
              ▼
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
