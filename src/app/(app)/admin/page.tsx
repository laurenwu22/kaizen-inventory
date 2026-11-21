import { Suspense } from "react";
import { ContentSpinner, PendingButton } from "@/components/spinner";
import { ReorderList } from "@/components/admin/reorder-list";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { byPosition, describeDays } from "@/lib/quantity";
import { laDateString } from "@/lib/time";
import { ColorDot, PageTitle } from "@/components/admin/admin-chrome";
import { ui } from "@/components/ui";
import { moveSection, setSectionActive } from "./actions";

// Admin > Sections: every section at the selected cafe, in employee order.

async function SectionsAdmin() {
  const session = await requireAdmin();
  const today = new Date(`${laDateString()}T00:00:00Z`);
  const sections = await prisma.section.findMany({
    where: { cafeId: session.current.cafeId },
    include: {
      _count: { select: { items: { where: { active: true } } } },
      extraDates: { where: { date: { gte: today } }, select: { date: true } },
    },
  });
  sections.sort(byPosition);
  const active = sections.filter((s) => s.active);
  const inactive = sections.filter((s) => !s.active);

  return (
    <>
      <PageTitle
        action={
          <Link href="/admin/sections/new" className={ui.primary}>
            + Add section
          </Link>
        }
      >
        Sections
      </PageTitle>

      {active.length === 0 ? (
        <div className={`${ui.card} p-6 text-ink/70`}>
          No sections yet. Add one, such as Perishables or Milk, then add the items to count in it.
        </div>
      ) : (
        <ReorderList
          moveAction={moveSection}
          idField="sectionId"
          rows={active.map((s) => ({
            id: s.id,
            name: s.name,
            href: `/admin/sections/${s.id}`,
            content: (
              <span className="flex items-center gap-3">
                <ColorDot color={s.color} size={14} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{s.name}</span>
                  <span className="block truncate text-sm text-ink/60">
                    {[
                      describeDays(s.daysOfWeek),
                      s.extraDates.length > 0
                        ? `+${s.extraDates.length} date${s.extraDates.length > 1 ? "s" : ""}`
                        : null,
                      `${s._count.items} item${s._count.items === 1 ? "" : "s"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </span>
            ),
          }))}
        />
      )}

      {inactive.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer py-2 font-semibold text-ink/60">
            Inactive sections ({inactive.length}) · reactivate or open to delete
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {inactive.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-2xl bg-cream/70 p-3 pl-4">
                <Link href={`/admin/sections/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3 text-ink/60">
                  <ColorDot color={s.color} />
                  <span className="truncate">{s.name}</span>
                </Link>
                <form action={setSectionActive}>
                  <input type="hidden" name="sectionId" value={s.id} />
                  <input type="hidden" name="active" value="true" />
                  <PendingButton className={ui.secondary}>Reactivate</PendingButton>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<ContentSpinner />}>
      <SectionsAdmin />
    </Suspense>
  );
}
