// Order history queries. Everything is scoped to one cafe.
import "server-only";
import { prisma } from "@/lib/db";
import { byPosition, compareNames } from "@/lib/quantity";
import { dateOnly, dateOnlyString } from "@/lib/time";

export type DotSection = { id: string; name: string; color: string };

/** For each date in [first, last], the sections counted that day (admin order). */
export async function loadMonthDots(cafeId: string, first: string, last: string): Promise<Record<string, DotSection[]>> {
  const submissions = await prisma.submission.findMany({
    where: { cafeId, businessDate: { gte: dateOnly(first), lte: dateOnly(last) } },
    select: {
      businessDate: true,
      lines: { select: { item: { select: { section: { select: { id: true, name: true, color: true, sortOrder: true } } } } } },
    },
  });
  const byDay = new Map<string, Map<string, DotSection & { sortOrder: number }>>();
  for (const s of submissions) {
    const ymd = dateOnlyString(s.businessDate);
    const sections = byDay.get(ymd) ?? new Map();
    for (const l of s.lines) sections.set(l.item.section.id, l.item.section);
    byDay.set(ymd, sections);
  }
  return Object.fromEntries(
    [...byDay].map(([ymd, sections]) => [
      ymd,
      [...sections.values()].sort(byPosition).map(({ id, name, color }) => ({ id, name, color })),
    ]),
  );
}

export type ItemHistory = {
  id: string;
  name: string;
  unit: string;
  section: string;
  /** The item or its section is inactive. */
  inactive: boolean;
  lastOrdered: { date: string; amount: number; by: string } | null;
  lastCounted: { date: string; by: string; plenty: boolean } | null;
};

type LatestRow = {
  itemId: string;
  businessDate: Date;
  finalOrder: unknown;
  wellStocked: boolean;
  firstName: string;
  lastName: string;
};

/**
 * Every item at the cafe (including inactive ones) with when it was last
 * ordered (latest line with an order above 0, per SPEC) and last counted.
 * DISTINCT ON fetches only the newest line per item, using the itemId index.
 */
export async function loadItemHistory(cafeId: string): Promise<ItemHistory[]> {
  const [items, ordered, counted] = await Promise.all([
    prisma.item.findMany({
      where: { section: { cafeId } },
      select: { id: true, name: true, unit: true, active: true, section: { select: { name: true, active: true } } },
    }),
    prisma.$queryRaw<LatestRow[]>`
      SELECT DISTINCT ON (l."itemId") l."itemId", s."businessDate", l."finalOrder", l."wellStocked", u."firstName", u."lastName"
      FROM "SubmissionLine" l
      JOIN "Submission" s ON s.id = l."submissionId"
      JOIN "User" u ON u.id = s."userId"
      WHERE s."cafeId" = ${cafeId} AND l."finalOrder" > 0
      ORDER BY l."itemId", s."submittedAt" DESC`,
    prisma.$queryRaw<LatestRow[]>`
      SELECT DISTINCT ON (l."itemId") l."itemId", s."businessDate", l."finalOrder", l."wellStocked", u."firstName", u."lastName"
      FROM "SubmissionLine" l
      JOIN "Submission" s ON s.id = l."submissionId"
      JOIN "User" u ON u.id = s."userId"
      WHERE s."cafeId" = ${cafeId}
      ORDER BY l."itemId", s."submittedAt" DESC`,
  ]);
  const orderedBy = new Map(ordered.map((r) => [r.itemId, r]));
  const countedBy = new Map(counted.map((r) => [r.itemId, r]));
  return items
    .map((i) => {
      const o = orderedBy.get(i.id);
      const c = countedBy.get(i.id);
      return {
        id: i.id,
        name: i.name,
        unit: i.unit,
        section: i.section.name,
        inactive: !i.active || !i.section.active,
        lastOrdered: o
          ? { date: dateOnlyString(o.businessDate), amount: Number(o.finalOrder), by: `${o.firstName} ${o.lastName}` }
          : null,
        lastCounted: c
          ? { date: dateOnlyString(c.businessDate), by: `${c.firstName} ${c.lastName}`, plenty: c.wellStocked }
          : null,
      };
    })
    .sort((a, b) => compareNames(a.name, b.name));
}
