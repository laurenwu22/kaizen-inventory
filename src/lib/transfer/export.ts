// Backup export: reads the chosen cafes and parts from the database into the
// backup format. History is read in pages so no single response is too big.
import "server-only";
import { prisma } from "@/lib/db";
import { dateOnly, dateOnlyString } from "@/lib/time";
import type { Prisma } from "@/generated/prisma/client";
import {
  withDependencies,
  type BackupAddition,
  type BackupCafe,
  type BackupPerson,
  type BackupSection,
  type BackupSubmission,
  type ExportOptions,
} from "./format";

export const HISTORY_PAGE = 100;

function historyWhere(o: ExportOptions): Prisma.SubmissionWhereInput {
  return {
    cafeId: { in: o.cafeIds },
    businessDate: { ...(o.from ? { gte: dateOnly(o.from) } : {}), ...(o.to ? { lte: dateOnly(o.to) } : {}) },
  };
}

/** Everything except submissions: cafes, people, sections, and "added by" records. */
export async function exportBase(o: ExportOptions): Promise<{
  cafes: BackupCafe[];
  people: BackupPerson[];
  sections: BackupSection[];
  additions: BackupAddition[];
  submissionCount: number;
}> {
  const parts = withDependencies(o.parts);
  const cafes = await prisma.cafe.findMany({ where: { id: { in: o.cafeIds } }, orderBy: { name: "asc" } });
  const cafeIds = cafes.map((c) => c.id);
  const opts = { ...o, cafeIds };

  let sections: BackupSection[] = [];
  if (parts.has("sections")) {
    const rows = await prisma.section.findMany({
      where: { cafeId: { in: cafeIds } },
      include: { extraDates: true, items: { include: { rules: true } } },
      orderBy: [{ cafeId: "asc" }, { sortOrder: "asc" }],
    });
    sections = rows.map((s) => ({
      id: s.id,
      cafeId: s.cafeId,
      name: s.name,
      color: s.color,
      daysOfWeek: s.daysOfWeek,
      sortOrder: s.sortOrder,
      active: s.active,
      createdAt: s.createdAt.toISOString(),
      extraDates: s.extraDates.map((d) => dateOnlyString(d.date)).sort(),
      items: s.items
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          sortOrder: i.sortOrder,
          active: i.active,
          createdAt: i.createdAt.toISOString(),
          rules: i.rules.map((r) => ({
            type: r.type,
            weekday: r.weekday,
            date: r.date ? dateOnlyString(r.date) : null,
            min: Number(r.min),
            max: Number(r.max),
          })),
        })),
    }));
  }

  let additions: BackupAddition[] = [];
  let submissionCount = 0;
  const referenced = new Set<string>();
  if (parts.has("history")) {
    const where = historyWhere(opts);
    const [adds, count, submitters] = await Promise.all([
      prisma.dayAddition.findMany({ where: where as Prisma.DayAdditionWhereInput, orderBy: { createdAt: "asc" } }),
      prisma.submission.count({ where }),
      prisma.submission.findMany({ where, distinct: ["userId"], select: { userId: true } }),
    ]);
    additions = adds.map((a) => ({
      cafeId: a.cafeId,
      businessDate: dateOnlyString(a.businessDate),
      sectionId: a.sectionId,
      itemId: a.itemId,
      addedById: a.addedById,
      createdAt: a.createdAt.toISOString(),
    }));
    submissionCount = count;
    for (const s of submitters) referenced.add(s.userId);
    for (const a of adds) referenced.add(a.addedById);
  }

  let people: BackupPerson[] = [];
  if (parts.has("people")) {
    const rows = await prisma.user.findMany({
      where: {
        OR: [{ cafes: { some: { cafeId: { in: cafeIds } } } }, { isManager: true }, { id: { in: [...referenced] } }],
      },
      include: { cafes: { where: { cafeId: { in: cafeIds } } } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
    people = rows.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      pin: u.pin,
      active: u.active,
      isManager: u.isManager,
      createdAt: u.createdAt.toISOString(),
      memberships: u.cafes.map((m) => ({ cafeId: m.cafeId, role: m.role, createdAt: m.createdAt.toISOString() })),
    }));
  }

  return {
    cafes: cafes.map((c) => ({ id: c.id, name: c.name, createdAt: c.createdAt.toISOString() })),
    people,
    sections,
    additions,
    submissionCount,
  };
}

/** One page of submissions (oldest first), with a cursor for the next page. */
export async function exportHistoryPage(
  o: ExportOptions,
  cursor: string | null,
): Promise<{ submissions: BackupSubmission[]; nextCursor: string | null }> {
  if (!withDependencies(o.parts).has("history")) return { submissions: [], nextCursor: null };
  const rows = await prisma.submission.findMany({
    where: historyWhere(o),
    include: { lines: true },
    orderBy: { id: "asc" },
    take: HISTORY_PAGE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  return {
    submissions: rows.map((s) => ({
      id: s.id,
      cafeId: s.cafeId,
      userId: s.userId,
      businessDate: dateOnlyString(s.businessDate),
      submittedAt: s.submittedAt.toISOString(),
      lines: s.lines.map((l) => ({
        itemId: l.itemId,
        currentCount: l.currentCount === null ? null : Number(l.currentCount),
        autoOrder: Number(l.autoOrder),
        finalOrder: Number(l.finalOrder),
        manuallyEdited: l.manuallyEdited,
        wellStocked: l.wellStocked,
      })),
    })),
    nextCursor: rows.length === HISTORY_PAGE ? rows[rows.length - 1].id : null,
  };
}
