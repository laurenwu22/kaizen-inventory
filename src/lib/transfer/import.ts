// Backup import: merges a backup into this database without duplicating.
//
// Matching (file record -> record here):
//   cafes     same id, else same name
//   people    same id, else same PIN *and* same name (a PIN that belongs to
//             someone else here is a problem: that person is skipped)
//   sections  same id in the same cafe, else same name in that cafe
//   items     same id in the same section, else same name in that section
//   history   same id = already here (never doubled)
// New records keep their ids from the file when free, so re-importing the
// same file finds them and changes nothing.
//
// Modes: "keep" adds only what's missing; "update" also overwrites matched
// people, sections, items and amounts with the file's version.
import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertActiveManager } from "@/lib/admin/managers";
import { dateOnly } from "@/lib/time";
import { Prisma } from "@/generated/prisma/client";
import { submissionProblem, type BackupAddition, type BackupSection, type BackupSubmission, type BasePayload, type IdMaps } from "./format";

export type ImportMode = "keep" | "update";
export type Tally = { added: number; updated: number; kept: number };
export type BaseResult = {
  maps: IdMaps;
  counts: { cafes: Tally; people: Tally; sections: Tally; items: Tally };
  problems: string[];
};

const tally = (): Tally => ({ added: 0, updated: 0, kept: 0 });
const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;
const sameName = (a: { firstName: string; lastName: string }, b: { firstName: string; lastName: string }) =>
  fullName(a).trim().toLowerCase() === fullName(b).trim().toLowerCase();
const LONG_TX = { timeout: 120_000, maxWait: 15_000 };

type Tx = Prisma.TransactionClient;

class Rollback extends Error {
  constructor(public result: BaseResult) {
    super("preview rollback");
  }
}

/** Imports cafes, people and sections/items in one transaction. */
export async function importBase(payload: BasePayload, mode: ImportMode): Promise<BaseResult> {
  return prisma.$transaction((tx) => mergeBase(tx, payload, mode), LONG_TX);
}

/** Runs the same import and rolls it back: exactly what would happen. */
export async function previewBase(payload: BasePayload, mode: ImportMode): Promise<BaseResult> {
  try {
    await prisma.$transaction(async (tx) => {
      throw new Rollback(await mergeBase(tx, payload, mode));
    }, LONG_TX);
  } catch (e) {
    if (e instanceof Rollback) return e.result;
    throw e;
  }
  throw new Error("unreachable");
}

async function mergeBase(tx: Tx, payload: BasePayload, mode: ImportMode): Promise<BaseResult> {
  const update = mode === "update";
  const maps: IdMaps = { cafes: {}, people: {}, sections: {}, items: {} };
  const counts = { cafes: tally(), people: tally(), sections: tally(), items: tally() };
  const problems: string[] = [];

  // ---- Cafes
  const [cafesById, cafesByName] = await Promise.all([
    tx.cafe.findMany({ where: { id: { in: payload.cafes.map((c) => c.id) } } }),
    tx.cafe.findMany({ where: { name: { in: payload.cafes.map((c) => c.name) } } }),
  ]);
  const cafeById = new Map(cafesById.map((c) => [c.id, c]));
  const cafeByName = new Map(cafesByName.map((c) => [c.name, c]));
  for (const c of payload.cafes) {
    const byId = cafeById.get(c.id);
    const byName = cafeByName.get(c.name);
    if (byId) {
      maps.cafes[c.id] = byId.id;
      if (update && byId.name !== c.name && !byName) {
        await tx.cafe.update({ where: { id: byId.id }, data: { name: c.name } });
        counts.cafes.updated++;
      } else counts.cafes.kept++;
    } else if (byName) {
      maps.cafes[c.id] = byName.id;
      counts.cafes.kept++;
    } else {
      await tx.cafe.create({ data: { id: c.id, name: c.name, createdAt: new Date(c.createdAt) } });
      cafeByName.set(c.name, { id: c.id, name: c.name, createdAt: new Date(c.createdAt) });
      maps.cafes[c.id] = c.id;
      counts.cafes.added++;
    }
  }

  // ---- People and memberships
  const [usersById, usersByPin] = await Promise.all([
    tx.user.findMany({ where: { id: { in: payload.people.map((p) => p.id) } } }),
    tx.user.findMany({ where: { pin: { in: payload.people.map((p) => p.pin) } } }),
  ]);
  const userById = new Map(usersById.map((u) => [u.id, u]));
  const userByPin = new Map(usersByPin.map((u) => [u.pin, u]));
  for (const p of payload.people) {
    const byId = userById.get(p.id);
    const byPin = userByPin.get(p.pin);
    let dbId: string | null = null;
    if (byId) {
      dbId = byId.id;
      if (update) {
        const pinFree = !byPin || byPin.id === byId.id;
        if (!pinFree) problems.push(`${fullName(p)}: PIN ${p.pin} belongs to ${fullName(byPin!)} here, so their PIN wasn't changed.`);
        await tx.user.update({
          where: { id: byId.id },
          data: {
            firstName: p.firstName,
            lastName: p.lastName,
            active: p.active,
            isManager: p.isManager,
            ...(pinFree ? { pin: p.pin } : {}),
          },
        });
        counts.people.updated++;
      } else counts.people.kept++;
    } else if (byPin) {
      if (sameName(byPin, p)) {
        dbId = byPin.id;
        if (update) {
          await tx.user.update({ where: { id: byPin.id }, data: { active: p.active, isManager: p.isManager } });
          counts.people.updated++;
        } else counts.people.kept++;
      } else {
        problems.push(`${fullName(p)} was skipped: PIN ${p.pin} already belongs to ${fullName(byPin)} here.`);
      }
    } else {
      await tx.user.create({
        data: {
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          pin: p.pin,
          active: p.active,
          isManager: p.isManager,
          createdAt: new Date(p.createdAt),
        },
      });
      userByPin.set(p.pin, { ...p, createdAt: new Date(p.createdAt), updatedAt: new Date() });
      dbId = p.id;
      counts.people.added++;
    }
    if (dbId) maps.people[p.id] = dbId;
  }

  const memberRows = await tx.userCafe.findMany({
    where: { userId: { in: Object.values(maps.people) }, cafeId: { in: Object.values(maps.cafes) } },
  });
  const memberKey = (u: string, c: string) => `${u}|${c}`;
  const members = new Map(memberRows.map((m) => [memberKey(m.userId, m.cafeId), m]));
  const newMembers: Prisma.UserCafeCreateManyInput[] = [];
  for (const p of payload.people) {
    const userId = maps.people[p.id];
    if (!userId) continue;
    for (const m of p.memberships) {
      const cafeId = maps.cafes[m.cafeId];
      if (!cafeId) continue;
      const existing = members.get(memberKey(userId, cafeId));
      if (!existing) {
        newMembers.push({ userId, cafeId, role: m.role, createdAt: new Date(m.createdAt) });
        members.set(memberKey(userId, cafeId), { userId, cafeId, role: m.role, createdAt: new Date(m.createdAt) });
      } else if (update && existing.role !== m.role) {
        await tx.userCafe.update({ where: { userId_cafeId: { userId, cafeId } }, data: { role: m.role } });
      }
    }
  }
  if (newMembers.length) await tx.userCafe.createMany({ data: newMembers, skipDuplicates: true });

  // ---- Sections, items, amounts
  await mergeSections(tx, payload.sections, maps, counts, problems, update);

  if (update) await assertActiveManager(tx);
  return { maps, counts, problems };
}

async function mergeSections(
  tx: Tx,
  sections: BackupSection[],
  maps: IdMaps,
  counts: BaseResult["counts"],
  problems: string[],
  update: boolean,
) {
  if (sections.length === 0) return;
  const cafeIds = [...new Set(Object.values(maps.cafes))];
  const fileItems = sections.flatMap((s) => s.items);
  const [secById, secInCafes, itemById] = await Promise.all([
    tx.section.findMany({ where: { id: { in: sections.map((s) => s.id) } } }),
    tx.section.findMany({ where: { cafeId: { in: cafeIds } } }),
    tx.item.findMany({ where: { id: { in: fileItems.map((i) => i.id) } } }),
  ]);
  const takenSectionIds = new Set(secById.map((s) => s.id));
  const sectionById = new Map(secById.map((s) => [s.id, s]));
  const sectionByName = new Map(secInCafes.map((s) => [`${s.cafeId}|${s.name}`, s]));
  const takenItemIds = new Set(itemById.map((i) => i.id));
  const itemByIdMap = new Map(itemById.map((i) => [i.id, i]));

  const newSections: Prisma.SectionCreateManyInput[] = [];
  const newExtraDates: Prisma.SectionExtraDateCreateManyInput[] = [];
  const newItems: Prisma.ItemCreateManyInput[] = [];
  const newRules: Prisma.QuantityRuleCreateManyInput[] = [];
  const ruleRows = (itemId: string, rules: BackupSection["items"][number]["rules"]) =>
    rules.map((r) => ({
      itemId,
      type: r.type,
      weekday: r.weekday,
      date: r.date ? dateOnly(r.date) : null,
      min: r.min,
      max: r.max,
    }));

  // Matched sections, whose existing items need looking up.
  const matchedSectionIds: string[] = [];
  const plan: { file: BackupSection; dbId: string; isNew: boolean }[] = [];
  for (const s of sections) {
    const cafeId = maps.cafes[s.cafeId];
    if (!cafeId) continue;
    const byId = sectionById.get(s.id);
    const match = byId && byId.cafeId === cafeId ? byId : sectionByName.get(`${cafeId}|${s.name}`);
    if (match) {
      maps.sections[s.id] = match.id;
      matchedSectionIds.push(match.id);
      plan.push({ file: s, dbId: match.id, isNew: false });
      if (update) {
        const nameFree = match.name === s.name || !sectionByName.has(`${cafeId}|${s.name}`);
        if (!nameFree) problems.push(`Section "${match.name}" wasn't renamed to "${s.name}": that name is already used.`);
        await tx.section.update({
          where: { id: match.id },
          data: {
            color: s.color,
            daysOfWeek: s.daysOfWeek,
            sortOrder: s.sortOrder,
            active: s.active,
            ...(nameFree ? { name: s.name } : {}),
          },
        });
        await tx.sectionExtraDate.deleteMany({ where: { sectionId: match.id } });
        newExtraDates.push(...s.extraDates.map((d) => ({ sectionId: match.id, date: dateOnly(d) })));
        counts.sections.updated++;
      } else counts.sections.kept++;
    } else {
      const id = takenSectionIds.has(s.id) ? randomUUID() : s.id;
      takenSectionIds.add(id);
      newSections.push({
        id,
        cafeId,
        name: s.name,
        color: s.color,
        daysOfWeek: s.daysOfWeek,
        sortOrder: s.sortOrder,
        active: s.active,
        createdAt: new Date(s.createdAt),
      });
      sectionByName.set(`${cafeId}|${s.name}`, { id, cafeId, name: s.name } as (typeof secInCafes)[number]);
      newExtraDates.push(...s.extraDates.map((d) => ({ sectionId: id, date: dateOnly(d) })));
      maps.sections[s.id] = id;
      plan.push({ file: s, dbId: id, isNew: true });
      counts.sections.added++;
    }
  }

  const existingItems = matchedSectionIds.length
    ? await tx.item.findMany({ where: { sectionId: { in: matchedSectionIds } } })
    : [];
  const itemByName = new Map(existingItems.map((i) => [`${i.sectionId}|${i.name}`, i]));
  const rulesToReplace: string[] = [];

  for (const { file, dbId, isNew } of plan) {
    for (const i of file.items) {
      const byId = itemByIdMap.get(i.id);
      const match = isNew ? undefined : byId && byId.sectionId === dbId ? byId : itemByName.get(`${dbId}|${i.name}`);
      if (match) {
        maps.items[i.id] = match.id;
        if (update) {
          const nameFree = match.name === i.name || !itemByName.has(`${dbId}|${i.name}`);
          if (!nameFree) problems.push(`Item "${match.name}" wasn't renamed to "${i.name}": that name is already used.`);
          await tx.item.update({
            where: { id: match.id },
            data: { unit: i.unit, sortOrder: i.sortOrder, active: i.active, ...(nameFree ? { name: i.name } : {}) },
          });
          rulesToReplace.push(match.id);
          newRules.push(...ruleRows(match.id, i.rules));
          counts.items.updated++;
        } else counts.items.kept++;
      } else {
        const id = takenItemIds.has(i.id) ? randomUUID() : i.id;
        takenItemIds.add(id);
        newItems.push({
          id,
          sectionId: dbId,
          name: i.name,
          unit: i.unit,
          sortOrder: i.sortOrder,
          active: i.active,
          createdAt: new Date(i.createdAt),
        });
        itemByName.set(`${dbId}|${i.name}`, { id, sectionId: dbId, name: i.name } as (typeof existingItems)[number]);
        newRules.push(...ruleRows(id, i.rules));
        maps.items[i.id] = id;
        counts.items.added++;
      }
    }
  }

  if (newSections.length) await tx.section.createMany({ data: newSections });
  if (newExtraDates.length) await tx.sectionExtraDate.createMany({ data: newExtraDates, skipDuplicates: true });
  if (newItems.length) await tx.item.createMany({ data: newItems });
  if (rulesToReplace.length) await tx.quantityRule.deleteMany({ where: { itemId: { in: rulesToReplace } } });
  if (newRules.length) await tx.quantityRule.createMany({ data: newRules, skipDuplicates: true });
}

/** Submission ids from the list that are already in this database. */
export async function existingSubmissionIds(ids: string[]): Promise<string[]> {
  const rows = await prisma.submission.findMany({ where: { id: { in: ids } }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Imports one batch of submissions (with their lines). Already-present ones are skipped. */
export async function importSubmissions(
  subs: BackupSubmission[],
  maps: IdMaps,
): Promise<{ added: number; skipped: number; problems: string[] }> {
  const existing = new Set(await existingSubmissionIds(subs.map((s) => s.id)));
  const problems: string[] = [];
  const toAdd: BackupSubmission[] = [];
  for (const s of subs) {
    if (existing.has(s.id)) continue;
    const why = submissionProblem(s, maps);
    if (why) problems.push(`A submission from ${s.businessDate} was skipped: ${why}.`);
    else toAdd.push(s);
  }
  if (toAdd.length) {
    await prisma.$transaction(
      [
        prisma.submission.createMany({
          data: toAdd.map((s) => ({
            id: s.id,
            cafeId: maps.cafes[s.cafeId],
            userId: maps.people[s.userId],
            businessDate: dateOnly(s.businessDate),
            submittedAt: new Date(s.submittedAt),
          })),
          skipDuplicates: true,
        }),
        prisma.submissionLine.createMany({
          data: toAdd.flatMap((s) =>
            s.lines.map((l) => ({
              submissionId: s.id,
              itemId: maps.items[l.itemId],
              currentCount: l.currentCount,
              autoOrder: l.autoOrder,
              finalOrder: l.finalOrder,
              manuallyEdited: l.manuallyEdited,
              wellStocked: l.wellStocked,
            })),
          ),
          skipDuplicates: true,
        }),
      ],
      LONG_TX,
    );
  }
  return { added: toAdd.length, skipped: existing.size, problems };
}

/** Imports "added by" records. Ones already here are skipped. */
export async function importAdditions(adds: BackupAddition[], maps: IdMaps): Promise<{ added: number }> {
  const data = adds.flatMap((a) => {
    const cafeId = maps.cafes[a.cafeId];
    const addedById = maps.people[a.addedById];
    const sectionId = a.sectionId ? maps.sections[a.sectionId] : null;
    const itemId = a.itemId ? maps.items[a.itemId] : null;
    if (!cafeId || !addedById || (a.sectionId && !sectionId) || (a.itemId && !itemId)) return [];
    return [{ cafeId, addedById, sectionId, itemId, businessDate: dateOnly(a.businessDate), createdAt: new Date(a.createdAt) }];
  });
  if (data.length === 0) return { added: 0 };
  const r = await prisma.dayAddition.createMany({ data, skipDuplicates: true });
  return { added: r.count };
}
