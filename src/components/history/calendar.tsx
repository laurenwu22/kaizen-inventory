import Link from "next/link";
import { addMonths, monthGrid, monthLabel, monthOf, WEEKDAY_INITIALS } from "@/lib/history";
import type { DotSection } from "@/lib/history-data";
import { ui } from "@/components/ui";
import { PendingDot, ReportPending } from "./pending";

const href = (month: string, date: string) => `/history?month=${month}&date=${date}`;

/** Month grid (Monday first) with one colored dot per section counted that day. */
export function Calendar({
  month,
  selected,
  today,
  dots,
}: {
  month: string;
  selected: string;
  today: string;
  dots: Record<string, DotSection[]>;
}) {
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const canGoNext = next <= monthOf(today);
  const nav = "flex h-11 w-11 items-center justify-center rounded-full text-xl text-ink/70 ring-1 ring-ink/15 active:bg-cream";

  return (
    <div className={`${ui.card} p-3 sm:p-4`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link href={href(prev, selected)} scroll={false} aria-label="Previous month" className={nav}>
          ‹
          <ReportPending />
          </Link>
        <div className="flex items-center gap-3">
          <h2 className="relative text-lg font-bold">
            {monthLabel(month)}
            <span className="absolute top-1/2 -left-7 -translate-y-1/2">
              <PendingDot />
            </span>
          </h2>
          {(month !== monthOf(today) || selected !== today) && (
            <Link href={href(monthOf(today), today)} scroll={false} className="rounded-full px-3 py-1 text-sm font-semibold text-[#7a6535] ring-1 ring-gold/40 active:bg-cream">
              Today
              <ReportPending />
          </Link>
          )}
        </div>
        {canGoNext ? (
          <Link href={href(next, selected)} scroll={false} aria-label="Next month" className={nav}>
            ›
            <ReportPending />
          </Link>
        ) : (
          <span className={`${nav} opacity-25`} aria-hidden>
            ›
          </span>
        )}
      </div>

      <div className="grid grid-cols-7 text-center text-xs font-semibold text-ink/45">
        {WEEKDAY_INITIALS.map((d, i) => (
          <div key={i} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {monthGrid(month, today)
          .flat()
          .map((c) => {
            const sections = dots[c.ymd] ?? [];
            const isSelected = c.ymd === selected;
            const content = (
              <>
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                    isSelected ? "bg-ink font-bold text-white" : c.isToday ? "font-bold ring-2 ring-gold" : ""
                  }`}
                >
                  {c.day}
                </span>
                <span className="flex h-2 items-center gap-0.5">
                  {sections.slice(0, 4).map((s) => (
                    <span key={s.id} title={s.name} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                  ))}
                  {sections.length > 4 && <span className="text-[9px] leading-none text-ink/55">+{sections.length - 4}</span>}
                </span>
              </>
            );
            const label = `${c.ymd}${sections.length ? `, counted: ${sections.map((s) => s.name).join(", ")}` : ""}`;
            return c.isFuture ? (
              <span key={c.ymd} aria-disabled className={`flex h-14 flex-col items-center justify-center gap-1 ${c.inMonth ? "text-ink/25" : "text-ink/15"}`}>
                {content}
              </span>
            ) : (
              <Link
                key={c.ymd}
                href={href(monthOf(c.ymd), c.ymd)}
                scroll={false}
                aria-label={label}
                aria-current={isSelected ? "date" : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-1 rounded-xl active:bg-cream ${c.inMonth ? "" : "text-ink/35"}`}
              >
                {content}
                <ReportPending />
          </Link>
            );
          })}
      </div>
    </div>
  );
}
