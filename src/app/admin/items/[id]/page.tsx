import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { cafeUnits, getOwnedItem, toRule } from "@/lib/admin/data";
import { prisma } from "@/lib/db";
import { formatQty, resolveForWeekday, WEEK_ORDER, WEEKDAY_LONG } from "@/lib/quantity";
import { formatYmd, laDateString } from "@/lib/time";
import { AdminChrome, BackLink, Card, ColorDot, PageTitle } from "@/components/admin/admin-chrome";
import { ConfirmSubmit } from "@/components/admin/form-bits";
import { DateRuleForm, ItemForm, WeekdayOverrideForm } from "@/components/admin/forms";
import { ui } from "@/components/ui";
import {
  clearWeekdayRule,
  removeDateRule,
  setDateRule,
  setItemActive,
  setWeekdayRules,
  updateItem,
} from "../../actions";

async function ItemAdmin({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;
  const item = await getOwnedItem(session.current.cafeId, id);
  const [dbRules, units] = await Promise.all([
    prisma.quantityRule.findMany({ where: { itemId: item.id } }),
    cafeUnits(session.current.cafeId),
  ]);
  const rules = dbRules.map(toRule);
  const def = rules.find((r) => r.type === "DEFAULT");
  const today = laDateString();
  const dateRules = rules
    .filter((r) => r.type === "DATE")
    .sort((a, b) => a.date!.localeCompare(b.date!));
  const upcoming = dateRules.filter((r) => r.date! >= today);
  const pastCount = dateRules.length - upcoming.length;
  const range = (min: number, max: number) => `${formatQty(min)}–${formatQty(max)} ${item.unit}`;

  return (
    <AdminChrome session={session} tab="sections">
      <BackLink href={`/admin/sections/${item.sectionId}`}>
        <span className="ml-1 inline-flex items-center gap-2">
          <ColorDot color={item.section.color} size={10} />
          {item.section.name}
        </span>
      </BackLink>
      <PageTitle>
        <span className="flex items-center gap-3">
          {item.name}
          {!item.active && (
            <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-ink/60">Inactive</span>
          )}
        </span>
      </PageTitle>

      <div className="flex flex-col gap-5">
        <Card title="Item details">
          <ItemForm
            action={updateItem.bind(null, item.id)}
            units={units}
            defaults={{
              name: item.name,
              unit: item.unit,
              min: def ? formatQty(def.min) : "",
              max: def ? formatQty(def.max) : "",
            }}
            submitLabel="Save changes"
          />
        </Card>

        <Card title="Week at a glance">
          <p className="mb-4 text-sm text-ink/60">
            What employees see each day. <span className="inline-block h-2 w-2 rounded-full bg-gold" /> marks a day with its own amounts. One-time dates below take priority.
          </p>
          <ul className="mb-6 flex flex-col divide-y divide-ink/10">
            {WEEK_ORDER.map((d) => {
              const r = resolveForWeekday(rules, d);
              const overridden = r?.source === "WEEKDAY";
              return (
                <li key={d} className="flex min-h-12 items-center gap-3 py-1">
                  <span className="w-28 shrink-0 font-medium">{WEEKDAY_LONG[d]}</span>
                  <span
                    className={`flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap ${
                      overridden ? "font-semibold" : "text-ink/60"
                    }`}
                  >
                    {r ? range(r.min, r.max) : "—"}
                    {overridden && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-gold" aria-label="Override" title="Override" />
                    )}
                  </span>
                  {overridden && (
                    <form action={clearWeekdayRule}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="weekday" value={d} />
                      <button
                        className="h-11 px-2 text-sm font-semibold text-ink/60 underline"
                        aria-label={`Reset ${WEEKDAY_LONG[d]} to default`}
                      >
                        Reset
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
          <h3 className="mb-3 font-semibold">Set different amounts for certain days</h3>
          <WeekdayOverrideForm action={setWeekdayRules.bind(null, item.id)} unit={item.unit} />
        </Card>

        <Card title="One-time dates">
          <p className="mb-4 text-sm text-ink/60">For events or holidays. Overrides the weekday and default amounts.</p>
          {upcoming.length > 0 && (
            <ul className="mb-5 flex flex-col gap-2">
              {upcoming.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-cream/60 py-1 pr-1 pl-3">
                  <span>
                    <span className="font-medium">{formatYmd(r.date!)}</span>
                    <span className="text-ink/70"> · {range(r.min, r.max)}</span>
                  </span>
                  <form action={removeDateRule}>
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="ruleId" value={r.id} />
                    <button className="h-11 px-3 text-sm font-semibold text-red-700">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          {pastCount > 0 && (
            <p className="mb-4 text-sm text-ink/50">
              {pastCount} past date{pastCount > 1 ? "s" : ""} kept for history.
            </p>
          )}
          <DateRuleForm action={setDateRule.bind(null, item.id)} unit={item.unit} minDate={today} />
        </Card>

        <form action={setItemActive} className="pt-2">
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="active" value={item.active ? "false" : "true"} />
          {item.active ? (
            <>
              <ConfirmSubmit label="Deactivate item" confirmLabel="Yes, deactivate" className={ui.secondary} />
              <p className="mt-2 text-sm text-ink/55">
                Hides it from counting. Its amounts and history are kept, and you can reactivate it anytime.
              </p>
            </>
          ) : (
            <button className={ui.primary}>Reactivate item</button>
          )}
        </form>
      </div>
    </AdminChrome>
  );
}

export default function ItemPage(props: PageProps<"/admin/items/[id]">) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<p className="p-6 text-ink/60">Loading…</p>}>
        <ItemAdmin params={props.params} />
      </Suspense>
    </main>
  );
}
