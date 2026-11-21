// Admin data access. Every lookup is scoped to the admin's selected cafe, so an
// admin can never read or change another cafe's sections, items or rules by
// sending its id.
import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { Rule } from "@/lib/quantity";
import { dateOnlyString } from "@/lib/time";
import type { Prisma } from "@/generated/prisma/client";

export async function getOwnedSection(cafeId: string, sectionId: string) {
  const section = await prisma.section.findFirst({ where: { id: sectionId, cafeId } });
  if (!section) notFound();
  return section;
}

export async function getOwnedItem(cafeId: string, itemId: string) {
  const item = await prisma.item.findFirst({
    where: { id: itemId, section: { cafeId } },
    include: { section: true },
  });
  if (!item) notFound();
  return item;
}

type DbRule = {
  id: string;
  type: Rule["type"];
  weekday: number | null;
  date: Date | null;
  min: Prisma.Decimal;
  max: Prisma.Decimal;
};

export function toRule(r: DbRule): Rule {
  return {
    id: r.id,
    type: r.type,
    weekday: r.weekday,
    date: r.date ? dateOnlyString(r.date) : null,
    min: Number(r.min),
    max: Number(r.max),
  };
}

/** Units already used at this cafe, for suggestions. */
export async function cafeUnits(cafeId: string): Promise<string[]> {
  const rows = await prisma.item.findMany({
    where: { section: { cafeId } },
    distinct: ["unit"],
    select: { unit: true },
    orderBy: { unit: "asc" },
  });
  return rows.map((r) => r.unit);
}
