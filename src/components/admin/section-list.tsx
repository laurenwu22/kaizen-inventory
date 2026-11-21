"use client";

// Active sections with ▲▼ reordering. A move shows instantly (optimistic), the
// cards slide to their new places, and the moved card glows briefly. The server
// saves in the background; if it fails, the list snaps back to the saved order.
import Link from "next/link";
import { startTransition, useEffect, useLayoutEffect, useOptimistic, useRef, useState } from "react";
import { moveSection } from "@/app/(app)/admin/actions";
import { LinkSpinner } from "@/components/spinner";
import { ui } from "@/components/ui";

export type SectionRow = { id: string; name: string; color: string; subtitle: string };
type Move = { id: string; direction: "up" | "down" };

function applyMove(rows: SectionRow[], { id, direction }: Move): SectionRow[] {
  const i = rows.findIndex((r) => r.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return rows;
  const next = [...rows];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function SectionList({ sections }: { sections: SectionRow[] }) {
  const [rows, addMove] = useOptimistic(sections, applyMove);
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
      fd.set("sectionId", id);
      fd.set("direction", direction);
      await moveSection(fd);
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
    <ul className="flex flex-col gap-3">
      {rows.map((s, i) => (
        <li
          key={s.id}
          ref={(el) => {
            if (el) items.current.set(s.id, el);
            else items.current.delete(s.id);
          }}
          className={`relative flex items-center gap-3 rounded-2xl bg-white p-3 pl-4 ring-1 transition-[box-shadow,background-color] duration-500 ${
            glowId === s.id ? "z-10 bg-[#fbf7ee] shadow-[0_0_0_3px_rgba(176,148,88,0.55)] ring-gold" : "ring-ink/10"
          }`}
        >
          <Link href={`/admin/sections/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-1">
            <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{s.name}</span>
              <span className="block truncate text-sm text-ink/60">{s.subtitle}</span>
            </span>
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
