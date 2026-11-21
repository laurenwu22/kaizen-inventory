import { Suspense } from "react";
import { ContentSpinner, LinkSpinner, PendingButton } from "@/components/spinner";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { cafeUnits, getOwnedSection, toRule } from "@/lib/admin/data";
import { compareNames, formatQty, WEEKDAY_SHORT } from "@/lib/quantity";
import { dateOnlyString, formatYmd, laDateString } from "@/lib/time";
import { BackLink, Card, ColorDot, PageTitle } from "@/components/admin/admin-chrome";
import { ConfirmSubmit } from "@/components/admin/form-bits";
import { ExtraDateForm, SectionForm } from "@/components/admin/forms";
import { ui } from "@/components/ui";
import { AddItemModal } from "@/components/admin/add-item-modal";
import { addExtraDate, createItem, removeExtraDate, setSectionActive, updateSection } from "../../actions";

async function SectionAdmin({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;
  const section = await getOwnedSection(session.current.cafeId, id);
  const today = laDateString();

  const [extraDates, items, units] = await Promise.all([
    prisma.sectionExtraDate.findMany({
      where: { sectionId: section.id, date: { gte: new Date(`${today}T00:00:00Z`) } },
      orderBy: { date: "asc" },
    }),
    prisma.item.findMany({
      where: { sectionId: section.id },
      include: { rules: true },
    }),
    cafeUnits(session.current.cafeId),
  ]);
  // Items are always listed alphabetically.
  const activeItems = items.filter((i) => i.active).sort((a, b) => compareNames(a.name, b.name));

  return (
    <>
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
            <AddItemModal
              action={createItem.bind(null, section.id)}
              units={units}
              today={today}
              sectionName={section.name}
            />
          </div>
          {activeItems.length === 0 ? (
            <p className="text-ink/60">No items yet.</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {activeItems.map((item) => {
                const rules = item.rules.map(toRule);
                const def = rules.find((r) => r.type === "DEFAULT");
                const weekdayDays = rules.filter((r) => r.type === "WEEKDAY").map((r) => r.weekday!);
                const upcomingDates = rules.filter((r) => r.type === "DATE" && r.date! >= today);
                return (
                  <li key={item.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5">
                    <Link
                      href={`/admin/items/${item.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1.5 active:bg-cream"
                    >
                      <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{item.name}</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink/60">
                        <span>
                          {def ? `${formatQty(def.min)}–${formatQty(def.max)} ${item.unit}` : "No default set"}
                        </span>
                        {weekdayDays.length > 0 && (
                          <Badge>
                            {weekdayDays.length === 7
                              ? "Custom every day"
                              : `Custom: ${weekdayDays.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAY_SHORT[d]).join(", ")}`}
                          </Badge>
                        )}
                        {upcomingDates.length > 0 && (
                          <Badge>
                            {upcomingDates.length} upcoming date{upcomingDates.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                        {!def && <Badge tone="warn">Needs default</Badge>}
                      </span>
                      </span>
                      <LinkSpinner />
                    </Link>
                  </li>
                );
              })}
            </ul>
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
                      <PendingButton className="h-11 px-3 text-sm font-semibold text-red-700" aria-label={`Remove ${formatYmd(ymd)}`}>
                        Remove
                      </PendingButton>
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
            <PendingButton className={ui.primary}>Reactivate section</PendingButton>
          )}
        </form>
      </div>
    </>
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
    <Suspense fallback={<ContentSpinner />}>
      <SectionAdmin params={props.params} />
    </Suspense>
  );
}
