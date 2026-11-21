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
