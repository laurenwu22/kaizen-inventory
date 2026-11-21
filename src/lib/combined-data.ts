// Loads one cafe's submissions for one LA business date and merges them.
import "server-only";
import { prisma } from "@/lib/db";
import { dateOnly } from "@/lib/time";
import { mergeDay, type CombinedOrder, type ItemInfo } from "./combined";

export async function loadCombinedOrder(cafeId: string, ymd: string): Promise<CombinedOrder> {
  const submissions = await prisma.submission.findMany({
    where: { cafeId, businessDate: dateOnly(ymd) },
    orderBy: { submittedAt: "asc" },
    select: {
      submittedAt: true,
      user: { select: { firstName: true, lastName: true } },
      lines: {
        select: {
          itemId: true,
          finalOrder: true,
          item: {
            select: {
              name: true,
              unit: true,
              sortOrder: true,
              section: { select: { id: true, name: true, sortOrder: true } },
            },
          },
        },
      },
    },
  });
  const items = new Map<string, ItemInfo>();
  for (const s of submissions) for (const l of s.lines) items.set(l.itemId, l.item);
  return mergeDay(
    submissions.map((s) => ({
      submittedAt: s.submittedAt,
      submittedBy: `${s.user.firstName} ${s.user.lastName}`,
      lines: s.lines.map((l) => ({ itemId: l.itemId, finalOrder: Number(l.finalOrder) })),
    })),
    items,
  );
}

import type { SubmittedEntry } from "./combined-data-types";
export type { SubmittedEntry };

/**
 * Today's latest submitted line for each item at the cafe (latest count wins),
 * used to pre-fill the counting screen.
 */
export async function loadLatestEntries(cafeId: string, ymd: string): Promise<Record<string, SubmittedEntry>> {
  const rows = await prisma.$queryRaw<
    {
      itemId: string;
      currentCount: unknown;
      finalOrder: unknown;
      manuallyEdited: boolean;
      wellStocked: boolean;
      firstName: string;
      submittedAt: Date;
    }[]
  >`
    SELECT DISTINCT ON (l."itemId") l."itemId", l."currentCount", l."finalOrder", l."manuallyEdited", l."wellStocked",
           u."firstName", s."submittedAt"
    FROM "SubmissionLine" l
    JOIN "Submission" s ON s.id = l."submissionId"
    JOIN "User" u ON u.id = s."userId"
    WHERE s."cafeId" = ${cafeId} AND s."businessDate" = ${dateOnly(ymd)}::date
    ORDER BY l."itemId", s."submittedAt" DESC`;
  return Object.fromEntries(
    rows.map((r) => [
      r.itemId,
      {
        count: r.currentCount === null ? null : Number(r.currentCount),
        finalOrder: Number(r.finalOrder),
        manuallyEdited: r.manuallyEdited,
        plenty: r.wellStocked,
        by: r.firstName,
        at: r.submittedAt.toISOString(),
      },
    ]),
  );
}
