import type { CombinedOrder } from "@/lib/combined";
import { formatSlack } from "@/lib/combined";
import { formatQty } from "@/lib/quantity";
import { formatLaTime } from "@/lib/time";
import { CopyForSlack } from "@/components/copy-for-slack";
import { ui } from "@/components/ui";

/**
 * One day's combined order: who submitted, items to order by section (with
 * who counted each), and Copy for Slack. Used by the combined order page and
 * the order history day view.
 */
export function CombinedOrderDetails({
  ymd,
  order,
  emptyMessage,
}: {
  ymd: string;
  order: CombinedOrder;
  emptyMessage: string;
}) {
  if (order.submissions.length === 0) return <div className={`${ui.card} p-6 text-ink/70`}>{emptyMessage}</div>;
  return (
    <div className="flex flex-col gap-4">
      <div className={`${ui.card} px-5 py-4`}>
        <p className={`${ui.sectionTitle} mb-2`}>Submitted by</p>
        <p className="text-ink/80">
          {order.submissions.map((s, i) => (
            <span key={i}>
              {i > 0 && ", "}
              <span className="font-semibold">{s.by}</span> <span className="text-ink/55">({formatLaTime(s.at)})</span>
            </span>
          ))}
        </p>
      </div>
      {order.sections.length === 0 ? (
        <div className={`${ui.card} p-6 text-ink/70`}>Nothing was ordered this day.</div>
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
      <CopyForSlack text={formatSlack(ymd, order)} className="mt-2" />
    </div>
  );
}
