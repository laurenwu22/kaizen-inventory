import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { toRule } from "@/lib/admin/data";
import { buildCountSheet } from "@/lib/inventory";
import { formatSlack } from "@/lib/combined";
import { loadCombinedOrder } from "@/lib/combined-data";
import { dateOnly, dateOnlyString, formatLaDateTime, formatYmd, laDateString } from "@/lib/time";
import { ContentSpinner } from "@/components/spinner";
import { CountForm } from "@/components/inventory/count-form";

// Employee view: today's sections to count, then Submit.

async function InventoryHome() {
  const session = await requireUser();
  const cafeId = session.current.cafeId;
  const today = laDateString();

  const [sections, last, countedLines, combined] = await Promise.all([
    prisma.section.findMany({
      where: { cafeId, active: true },
      include: {
        extraDates: { where: { date: dateOnly(today) } },
        items: { where: { active: true }, include: { rules: true } },
      },
    }),
    prisma.submission.findFirst({
      where: { cafeId },
      orderBy: { submittedAt: "desc" },
      select: { submittedAt: true, user: { select: { firstName: true } } },
    }),
    // Items counted in any of today's submissions at this cafe.
    prisma.submissionLine.findMany({
      where: { submission: { cafeId, businessDate: dateOnly(today) } },
      distinct: ["itemId"],
      select: { itemId: true },
    }),
    loadCombinedOrder(cafeId, today),
  ]);

  const sheet = buildCountSheet(
    sections.map((s) => ({
      ...s,
      extraDates: s.extraDates.map((d) => dateOnlyString(d.date)),
      items: s.items.map((i) => ({ ...i, rules: i.rules.map(toRule) })),
    })),
    today,
    new Set(countedLines.map((l) => l.itemId)),
  );

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pt-5 pb-16">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">{formatYmd(today)}</h1>
        <p className="text-sm text-ink/60">
          {last
            ? `Inventory last updated ${formatLaDateTime(last.submittedAt)} by ${last.user.firstName}`
            : "No inventory submitted yet"}
        </p>
      </div>
      {/* Draft key is per user, cafe and day, so drafts never leak between them. */}
      <CountForm
        sheet={sheet}
        draftKey={`kaizen-draft:${session.user.id}:${cafeId}:${today}`}
        slackText={combined.submissions.length > 0 ? formatSlack(today, combined) : null}
      />
    </section>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<ContentSpinner />}>
      <InventoryHome />
    </Suspense>
  );
}
