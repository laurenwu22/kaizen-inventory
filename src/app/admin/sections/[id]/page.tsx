import { Suspense } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { getOwnedSection, toRule } from "@/lib/admin/data";
import { formatQty, WEEKDAY_SHORT } from "@/lib/quantity";
import { dateOnlyString, formatYmd, laDateString } from "@/lib/time";
import { AdminChrome, BackLink, Card, ColorDot, MoveButtons, PageTitle } from "@/components/admin/admin-chrome";
import { ConfirmSubmit } from "@/components/admin/form-bits";
import { ExtraDateForm, SectionForm } from "@/components/admin/forms";
import { ui } from "@/components/ui";
import { addExtraDate, moveItem, removeExtraDate, setItemActive, setSectionActive, updateSection } from "../../actions";

async function SectionAdmin({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;
  const section = await getOwnedSection(session.current.cafeId, id);
  const today = laDateString();

  const [extraDates, items] = await Promise.all([
    prisma.sectionExtraDate.findMany({
      where: { sectionId: section.id, date: { gte: new Date(`${today}T00:00:00Z`) } },
      orderBy: { date: "asc" },
    }),
    prisma.item.findMany({
      where: { sectionId: section.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { rules: true },
    }),
  ]);
  const activeItems = items.filter((i) => i.active);
  const inactiveItems = items.filter((i) => !i.active);

  return (
    <AdminChrome session={session} tab="sections">
      <BackLink href="/admin">Sections</BackLink>
      <PageTitle>
        <span className="flex items-center gap-3">
          <ColorDot color={section.color} size={16} />
          {section.name}
          {!section.active && <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-ink/60">Inactive</span>}
        </span>
      </PageTitle>

      <div className="flex flex-col gap-5">
        {/* Items first: it's what admins edit most */}
        <div className={`${ui.card} p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className={ui.sectionTitle}>Items</h2>
            <Link href={`/admin/sections/${section.id}/items/new`} className={ui.secondary}>
              + Add item
            </Link>
          </div>
          {activeItems.length === 0 ? (
            <p className="text-ink/60">No items yet.</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {activeItems.map((item, i) => {
                const rules = item.rules.map(toRule);
                const def = rules.find((r) => r.type === "DEFAULT");
                const weekdayDays = rules.filter((r) => r.type === "WEEKDAY").map((r) => r.weekday!);
                const upcomingDates = rules.filter((r) => r.type === "DATE" && r.date! >= today);
                return (
                  <li key={item.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5">
                    <Link href={`/admin/items/${item.id}`} className="min-w-0 flex-1 rounded-xl py-1.5 active:bg-cream">
                      <span className="block truncate font-semibold">{item.name}</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink/60">
                        <span>
                          {def ? `${formatQty(def.min)}–${formatQty(def.max)} ${item.unit}` : "No default set"}
                        </span>
                        {weekdayDays.length > 0 && (
                          <Badge>
                            {weekdayDays.length === 7
                              ? "Daily overrides"
                              : `${weekdayDays.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAY_SHORT[d]).join(", ")} override`}
                          </Badge>
                        )}
                        {upcomingDates.length > 0 && (
                          <Badge>
                            {upcomingDates.length} upcoming date{upcomingDates.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                        {!def && <Badge tone="warn">Needs default</Badge>}
                      </span>
                    </Link>
                    <MoveButtons
                      action={moveItem}
                      idName="itemId"
                      id={item.id}
                      isFirst={i === 0}
                      isLast={i === activeItems.length - 1}
                      label={item.name}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          {inactiveItems.length > 0 && (
            <details className="mt-4 border-t border-ink/10 pt-3">
              <summary className="cursor-pointer py-2 text-sm font-semibold text-ink/60">
                Inactive items ({inactiveItems.length})
              </summary>
              <ul className="mt-1 flex flex-col gap-1">
                {inactiveItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-1">
                    <Link href={`/admin/items/${item.id}`} className="min-w-0 flex-1 truncate text-ink/60">
                      {item.name}
                    </Link>
                    <form action={setItemActive}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="active" value="true" />
                      <button className={ui.secondary}>Reactivate</button>
                    </form>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <Card title="Section details">
          <SectionForm
            action={updateSection.bind(null, section.id)}
            defaults={{ name: section.name, color: section.color, days: section.daysOfWeek }}
            submitLabel="Save changes"
          />
        </Card>

        <Card title="Extra dates">
          <p className="mb-4 text-sm text-ink/60">
            Count this section on these dates too, even if it&apos;s not a regular day.
          </p>
          {extraDates.length > 0 && (
            <ul className="mb-4 flex flex-col gap-2">
              {extraDates.map((d) => {
                const ymd = dateOnlyString(d.date);
                return (
                  <li key={ymd} className="flex items-center justify-between gap-3 rounded-xl bg-cream/60 py-1 pr-1 pl-3">
                    <span className="font-medium">{formatYmd(ymd)}</span>
                    <form action={removeExtraDate}>
                      <input type="hidden" name="sectionId" value={section.id} />
                      <input type="hidden" name="date" value={ymd} />
                      <button className="h-11 px-3 text-sm font-semibold text-red-700" aria-label={`Remove ${formatYmd(ymd)}`}>
                        Remove
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
          <ExtraDateForm action={addExtraDate.bind(null, section.id)} minDate={today} />
        </Card>

        <form action={setSectionActive} className="pt-2">
          <input type="hidden" name="sectionId" value={section.id} />
          <input type="hidden" name="active" value={section.active ? "false" : "true"} />
          {section.active ? (
            <>
              <ConfirmSubmit label="Deactivate section" confirmLabel="Yes, deactivate" className={ui.secondary} />
              <p className="mt-2 text-sm text-ink/55">
                Hides it from employees. Items, rules and history are kept, and you can reactivate it anytime.
              </p>
            </>
          ) : (
            <button className={ui.primary}>Reactivate section</button>
          )}
        </form>
      </div>
    </AdminChrome>
  );
}

function Badge({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        tone === "warn" ? "bg-red-100 text-red-800" : "bg-gold/15 text-[#7a6535]"
      }`}
    >
      {children}
    </span>
  );
}

export default function SectionPage(props: PageProps<"/admin/sections/[id]">) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<p className="p-6 text-ink/60">Loading…</p>}>
        <SectionAdmin params={props.params} />
      </Suspense>
    </main>
  );
}
