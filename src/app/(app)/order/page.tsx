import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { loadCombinedOrder } from "@/lib/combined-data";
import { formatYmd, laDateString } from "@/lib/time";
import { ContentSpinner } from "@/components/spinner";
import { CombinedOrderDetails } from "@/components/combined-order-details";

// Today's combined order: every submission today at this cafe merged, latest
// count wins, only items to order. Anyone at the cafe can view it.

async function CombinedOrderView() {
  const session = await requireUser();
  const today = laDateString();
  const order = await loadCombinedOrder(session.current.cafeId, today);
  return (
    <>
      <p className="-mt-4 mb-5 text-sm text-ink/60">{formatYmd(today)}</p>
      <CombinedOrderDetails ymd={today} order={order} emptyMessage="No inventory submitted today." />
    </>
  );
}

export default function OrderPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 pt-5 pb-16">
      <h1 className="mb-5 text-2xl font-bold tracking-tight">Today&apos;s combined order</h1>
      <Suspense fallback={<ContentSpinner />}>
        <CombinedOrderView />
      </Suspense>
    </section>
  );
}
