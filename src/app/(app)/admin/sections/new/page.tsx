import { Suspense } from "react";
import { ContentSpinner } from "@/components/spinner";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { byPosition } from "@/lib/quantity";
import { BackLink, Card, PageTitle } from "@/components/admin/admin-chrome";
import { NewSectionForm, type SourceCafe } from "@/components/admin/new-section-form";
import { createSection } from "../../actions";

async function NewSection() {
  const { current, memberships } = await requireAdmin();
  // Sections can be duplicated from any cafe the user belongs to (managers: all).
  const sections = await prisma.section.findMany({
    where: { cafeId: { in: memberships.map((m) => m.cafeId) }, active: true },
    select: {
      id: true,
      cafeId: true,
      name: true,
      color: true,
      daysOfWeek: true,
      sortOrder: true,
      _count: { select: { items: { where: { active: true } } } },
    },
  });
  sections.sort(byPosition);
  const cafes: SourceCafe[] = memberships
    .map((m) => ({
      id: m.cafeId,
      name: m.cafeName,
      isCurrent: m.cafeId === current.cafeId,
      sections: sections
        .filter((s) => s.cafeId === m.cafeId)
        .map((s) => ({ id: s.id, name: s.name, color: s.color, days: s.daysOfWeek, items: s._count.items })),
    }))
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
  const takenNames = (
    await prisma.section.findMany({ where: { cafeId: current.cafeId }, select: { name: true } })
  ).map((s) => s.name.toLowerCase());

  return (
    <>
      <BackLink href="/admin">Sections</BackLink>
      <PageTitle>New section</PageTitle>
      <Card>
        <NewSectionForm action={createSection} cafes={cafes} takenNames={takenNames} />
      </Card>
    </>
  );
}

export default function NewSectionPage() {
  return (
    <Suspense fallback={<ContentSpinner />}>
      <NewSection />
    </Suspense>
  );
}
