import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { loadCombinedOrder } from "@/lib/combined-data";
import { formatSlack } from "@/lib/combined";
import { formatQty } from "@/lib/quantity";
import { formatLaTime, formatYmd, laDateString } from "@/lib/time";
import { ContentSpinner } from "@/components/spinner";
import { CopyForSlack } from "@/components/copy-for-slack";
import { ui } from "@/components/ui";

// Today's combined order: every submission today at this cafe merged, latest
// count wins, only items to order. Anyone at the cafe can view it.

async function CombinedOrderView() {
  const session = await requireUser();
  const today = laDateString();
  const order = await loadCombinedOrder(session.current.cafeId, today);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pt-5 pb-16">
      <h1 className="text-2xl font-bold tracking-tight">Today&apos;s combined order</h1>
      <p className="mb-5 text-sm text-ink/60">{formatYmd(today)}</p>

      {order.submissions.length === 0 ? (
        <div className={`${ui.card} p-6 text-ink/70`}>No inventory submitted today.</div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className={`${ui.card} px-5 py-4`}>
            <p className={`${ui.sectionTitle} mb-2`}>Submitted by</p>
            <p className="text-ink/80">
              {order.submissions.map((s, i) => (
                <span key={i}>
                  {i > 0 && ", "}
                  <span className="font-semibold">{s.by}</span>{" "}
                  <span className="text-ink/55">({formatLaTime(s.at)})</span>
                </span>
              ))}
            </p>
          </div>

          {order.sections.length === 0 ? (
            <div className={`${ui.card} p-6 text-ink/70`}>Nothing to order today.</div>
          ) : (
            order.sections.map((s) => (
              <div key={s.id} className={`${ui.card} px-5 py-4`}>
                <h2 className="mb-2 text-lg font-bold">{s.name}</h2>
                <ul className="divide-y divide-ink/10">
                  {s.lines.map((l) => (
                    <li key={l.itemId} className="flex items-baseline justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block font-medium">{l.name}</span>
                        <span className="block text-xs text-ink/50">
                          counted by {l.countedBy}, {formatLaTime(l.countedAt)}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold">
                        {formatQty(l.order)} {l.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}

          <CopyForSlack text={formatSlack(today, order)} className="mt-2" />
        </div>
      )}
    </section>
  );
}

export default function OrderPage() {
  return (
    <Suspense fallback={<ContentSpinner />}>
      <CombinedOrderView />
    </Suspense>
  );
}
