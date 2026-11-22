import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { loadCombinedOrder } from "@/lib/combined-data";
import { isMonth, isYmd, monthOf, monthRange } from "@/lib/history";
import { loadItemHistory, loadMonthDots } from "@/lib/history-data";
import { formatYmd, laDateString } from "@/lib/time";
import { Calendar } from "@/components/history/calendar";
import { ItemSearch } from "@/components/history/item-search";
import { CombinedOrderDetails } from "@/components/combined-order-details";
import { ContentSpinner } from "@/components/spinner";
import { HistoryPendingProvider, PendingArea, PendingDot } from "@/components/history/pending";
import { ui } from "@/components/ui";

// Order history: read-only, selected cafe only. ?month=YYYY-MM&date=YYYY-MM-DD

async function History({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireUser();
  const cafeId = session.current.cafeId;
  const sp = await searchParams;
  const today = laDateString();
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const rawDate = one(sp.date);
  const rawMonth = one(sp.month);
  // Future dates can't be selected.
  const date = isYmd(rawDate) && rawDate <= today ? rawDate : today;
  const month = isMonth(rawMonth) && rawMonth <= monthOf(today) ? rawMonth : monthOf(date);
  const { first, last } = monthRange(month);

  const [items, dots, order] = await Promise.all([
    loadItemHistory(cafeId),
    loadMonthDots(cafeId, first, last),
    loadCombinedOrder(cafeId, date),
  ]);

  return (
    <HistoryPendingProvider>
    <div className="flex flex-col gap-5">
      <ItemSearch items={items} />
      <Calendar month={month} selected={date} today={today} dots={dots} />
      <div>
        <h2 className={`${ui.sectionTitle} mb-3 flex items-center gap-2`}>
          <span>
            {formatYmd(date)}
            {date === today && " · Today"}
          </span>
          <PendingDot />
        </h2>
        <PendingArea>
          <CombinedOrderDetails ymd={date} order={order} emptyMessage="No inventory submitted this day." />
        </PendingArea>
      </div>
    </div>
    </HistoryPendingProvider>
  );
}

export default function HistoryPage(props: PageProps<"/history">) {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 pt-5 pb-16">
      <h1 className="mb-5 text-2xl font-bold tracking-tight">Order history</h1>
      <Suspense fallback={<ContentSpinner />}>
        <History searchParams={props.searchParams} />
      </Suspense>
    </section>
  );
}
