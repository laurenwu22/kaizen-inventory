import { Suspense } from "react";
import { requireManager } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { compareNames } from "@/lib/quantity";
import { PageTitle } from "@/components/admin/admin-chrome";
import { DeleteCafeModal, NewCafeModal } from "@/components/admin/cafe-editor";
import { ContentSpinner } from "@/components/spinner";
import { ui } from "@/components/ui";
import { createCafe, deleteCafe } from "./actions";

// Admin > Cafes (managers only).

async function CafesAdmin() {
  await requireManager();
  const [cafes, people] = await Promise.all([
    prisma.cafe.findMany({
      include: {
        _count: { select: { members: true, sections: true, submissions: true } },
        members: { select: { userId: true } },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      include: { cafes: { include: { cafe: { select: { name: true } } } } },
    }),
  ]);
  cafes.sort((a, b) => compareNames(a.name, b.name));
  people.sort((a, b) => compareNames(`${a.firstName} ${a.lastName}`, `${b.firstName} ${b.lastName}`));

  return (
    <>
      <PageTitle
        action={
          <NewCafeModal
            action={createCafe}
            people={people.map((p) => ({
              id: p.id,
              name: `${p.firstName} ${p.lastName}`,
              isManager: p.isManager,
              where: p.cafes.length
                ? p.cafes
                    .map((m) => m.cafe.name)
                    .sort(compareNames)
                    .join(", ")
                : p.isManager
                  ? "All cafes"
                  : "No cafes yet",
            }))}
          />
        }
      >
        Cafes
      </PageTitle>
      <ul className={`${ui.card} divide-y divide-ink/10`}>
        {cafes.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{c.name}</span>
              <span className="block text-sm text-ink/55">
                {c._count.members} {c._count.members === 1 ? "person" : "people"} · {c._count.sections}{" "}
                {c._count.sections === 1 ? "section" : "sections"}
              </span>
            </span>
            {cafes.length > 1 && (
              <DeleteCafeModal
                action={deleteCafe.bind(null, c.id)}
                cafe={{
                  name: c.name,
                  people: c._count.members,
                  sections: c._count.sections,
                  submissions: c._count.submissions,
                  onlyCafeFor: people
                    .filter((p) => !p.isManager && p.cafes.length === 1 && p.cafes[0].cafeId === c.id)
                    .map((p) => `${p.firstName} ${p.lastName}`),
                }}
              />
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-ink/55">
        To set up a new cafe&apos;s sections, switch to it from the cafe menu at the top.
      </p>
    </>
  );
}

export default function CafesPage() {
  return (
    <Suspense fallback={<ContentSpinner />}>
      <CafesAdmin />
    </Suspense>
  );
}
