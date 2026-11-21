"use server";

// Admin Server Actions for sections, items and quantity rules.
//
// Every action: (1) requireAdmin() for the selected cafe, re-checked in the DB;
// (2) loads the section/item through getOwned*() which is scoped to that cafe.
// Ids from the client are never trusted on their own.
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { getOwnedItem, getOwnedSection } from "@/lib/admin/data";
import {
  extraDateSchema,
  parseForm,
  parseItemForm,
  sectionSchema,
  saved,
  type FormState,
  type ItemInput,
} from "@/lib/admin/validation";
import { dateOnly, laDateString } from "@/lib/time";
import { byPosition } from "@/lib/quantity";
import { Prisma, RuleType } from "@/generated/prisma/client";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "");
const days = (fd: FormData) => fd.getAll("days").map(String);

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Rewrites sortOrder 0..n-1 after moving one id up or down among its siblings. */
function reorder(ids: string[], id: string, direction: "up" | "down"): string[] | null {
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// ---------------------------------------------------------------- Sections

export async function createSection(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireAdmin();
  const parsed = parseForm(sectionSchema, { name: str(fd, "name"), color: str(fd, "color"), days: days(fd) });
  if (!parsed.data) return parsed.state;

  let id: string;
  try {
    const last = await prisma.section.aggregate({ where: { cafeId: current.cafeId }, _max: { sortOrder: true } });
    const section = await prisma.section.create({
      data: {
        cafeId: current.cafeId,
        name: parsed.data.name,
        color: parsed.data.color,
        daysOfWeek: parsed.data.days,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
    id = section.id;
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { name: "A section with this name already exists" } };
    throw e;
  }
  redirect(`/admin/sections/${id}`);
}

export async function updateSection(sectionId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireAdmin();
  await getOwnedSection(current.cafeId, sectionId);
  const parsed = parseForm(sectionSchema, { name: str(fd, "name"), color: str(fd, "color"), days: days(fd) });
  if (!parsed.data) return parsed.state;
  try {
    await prisma.section.update({
      where: { id: sectionId },
      data: { name: parsed.data.name, color: parsed.data.color, daysOfWeek: parsed.data.days },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { name: "A section with this name already exists" } };
    throw e;
  }
  refresh();
  return saved();
}

export async function setSectionActive(fd: FormData): Promise<void> {
  const { current } = await requireAdmin();
  const section = await getOwnedSection(current.cafeId, str(fd, "sectionId"));
  await prisma.section.update({ where: { id: section.id }, data: { active: str(fd, "active") === "true" } });
  refresh();
}

export async function moveSection(fd: FormData): Promise<void> {
  const { current } = await requireAdmin();
  const section = await getOwnedSection(current.cafeId, str(fd, "sectionId"));
  const siblings = await prisma.section.findMany({
    where: { cafeId: current.cafeId, active: section.active },
    select: { id: true, sortOrder: true, name: true },
  });
  siblings.sort(byPosition);
  const order = reorder(siblings.map((s) => s.id), section.id, str(fd, "direction") === "up" ? "up" : "down");
  if (!order) return;
  await prisma.$transaction(order.map((id, sortOrder) => prisma.section.update({ where: { id }, data: { sortOrder } })));
  refresh();
}

export async function addExtraDate(sectionId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireAdmin();
  await getOwnedSection(current.cafeId, sectionId);
  const parsed = parseForm(extraDateSchema, { date: str(fd, "date") });
  if (!parsed.data) return parsed.state;
  await prisma.sectionExtraDate.createMany({
    data: [{ sectionId, date: dateOnly(parsed.data.date) }],
    skipDuplicates: true,
  });
  refresh();
  return saved();
}

export async function removeExtraDate(fd: FormData): Promise<void> {
  const { current } = await requireAdmin();
  const section = await getOwnedSection(current.cafeId, str(fd, "sectionId"));
  const parsed = extraDateSchema.safeParse({ date: str(fd, "date") });
  if (!parsed.success) return;
  await prisma.sectionExtraDate.deleteMany({ where: { sectionId: section.id, date: dateOnly(parsed.data.date) } });
  refresh();
}

// ------------------------------------------------------------------- Items

function itemFormFields(fd: FormData) {
  return {
    name: str(fd, "name"),
    unit: str(fd, "unit"),
    min: str(fd, "min"),
    max: str(fd, "max"),
    weekdays: str(fd, "weekdays"),
    dates: str(fd, "dates"),
  };
}

/** Rule rows for an item's default, custom weekday amounts and one-time dates. */
function ruleRows(itemId: string, data: ItemInput) {
  return [
    { itemId, type: RuleType.DEFAULT, min: data.min, max: data.max },
    ...data.weekdays.map((w) => ({ itemId, type: RuleType.WEEKDAY, weekday: w.day, min: w.min, max: w.max })),
    ...data.dates.map((d) => ({ itemId, type: RuleType.DATE, date: dateOnly(d.date), min: d.min, max: d.max })),
  ];
}

/** Creates an item with its default (required), custom daily amounts and one-time dates. */
export async function createItem(sectionId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireAdmin();
  await getOwnedSection(current.cafeId, sectionId);
  const parsed = parseItemForm(itemFormFields(fd), laDateString());
  if (!parsed.data) return parsed.state;
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      // New items go to the bottom of the section.
      const last = await tx.item.aggregate({ where: { sectionId }, _max: { sortOrder: true } });
      const item = await tx.item.create({
        data: { sectionId, name: data.name, unit: data.unit, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      });
      await tx.quantityRule.createMany({ data: ruleRows(item.id, data) });
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { name: "This section already has an item with this name" } };
    throw e;
  }
  refresh();
  return saved();
}

/**
 * Saves the whole item editor. The default, custom weekday amounts and upcoming
 * one-time dates are replaced with what was submitted; past one-time dates are
 * kept for history.
 */
export async function updateItem(itemId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireAdmin();
  const item = await getOwnedItem(current.cafeId, itemId);
  const today = laDateString();
  const parsed = parseItemForm(itemFormFields(fd), today);
  if (!parsed.data) return parsed.state;
  const data = parsed.data;

  try {
    await prisma.$transaction([
      prisma.item.update({ where: { id: item.id }, data: { name: data.name, unit: data.unit } }),
      prisma.quantityRule.deleteMany({
        where: {
          itemId: item.id,
          OR: [
            { type: { in: [RuleType.DEFAULT, RuleType.WEEKDAY] } },
            { type: RuleType.DATE, date: { gte: dateOnly(today) } },
          ],
        },
      }),
      prisma.quantityRule.createMany({ data: ruleRows(item.id, data) }),
    ]);
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { name: "This section already has an item with this name" } };
    throw e;
  }
  // Back to the item's section after saving.
  redirect(`/admin/sections/${item.sectionId}`);
}

/**
 * Permanently deletes an item and its quantity rules. Refuses if the item has
 * been counted in a submission, so past orders are never silently changed.
 */
export async function deleteItem(itemId: string): Promise<FormState> {
  const { current } = await requireAdmin();
  const item = await getOwnedItem(current.cafeId, itemId);
  const counted = await prisma.submissionLine.count({ where: { itemId: item.id } });
  if (counted > 0) {
    return {
      error: `${item.name} has been counted before, so deleting it would change past orders. It can't be deleted.`,
    };
  }
  await prisma.$transaction([
    prisma.quantityRule.deleteMany({ where: { itemId: item.id } }),
    prisma.item.delete({ where: { id: item.id } }),
  ]);
  redirect(`/admin/sections/${item.sectionId}`);
}

export async function moveItem(fd: FormData): Promise<void> {
  const { current } = await requireAdmin();
  const item = await getOwnedItem(current.cafeId, str(fd, "itemId"));
  const siblings = await prisma.item.findMany({
    where: { sectionId: item.sectionId, active: true },
    select: { id: true, sortOrder: true, name: true },
  });
  siblings.sort(byPosition);
  const order = reorder(siblings.map((s) => s.id), item.id, str(fd, "direction") === "up" ? "up" : "down");
  if (!order) return;
  await prisma.$transaction(order.map((id, sortOrder) => prisma.item.update({ where: { id }, data: { sortOrder } })));
  refresh();
}
