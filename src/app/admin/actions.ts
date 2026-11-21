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
  dateRuleSchema,
  extraDateSchema,
  itemSchema,
  parseForm,
  sectionSchema,
  weekdayRuleSchema,
  saved,
  type FormState,
} from "@/lib/admin/validation";
import { dateOnly } from "@/lib/time";
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
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true },
  });
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

export async function createItem(sectionId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireAdmin();
  await getOwnedSection(current.cafeId, sectionId);
  const parsed = parseForm(itemSchema, {
    name: str(fd, "name"),
    unit: str(fd, "unit"),
    min: str(fd, "min"),
    max: str(fd, "max"),
  });
  if (!parsed.data) return parsed.state;
  const { name, unit, min, max } = parsed.data;

  let id: string;
  try {
    const last = await prisma.item.aggregate({ where: { sectionId }, _max: { sortOrder: true } });
    // An item is never saved without its default min/max.
    const item = await prisma.item.create({
      data: {
        sectionId,
        name,
        unit,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
        rules: { create: { type: RuleType.DEFAULT, min, max } },
      },
    });
    id = item.id;
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { name: "This section already has an item with this name" } };
    throw e;
  }
  redirect(`/admin/items/${id}`);
}

export async function updateItem(itemId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireAdmin();
  const item = await getOwnedItem(current.cafeId, itemId);
  const parsed = parseForm(itemSchema, {
    name: str(fd, "name"),
    unit: str(fd, "unit"),
    min: str(fd, "min"),
    max: str(fd, "max"),
  });
  if (!parsed.data) return parsed.state;
  const { name, unit, min, max } = parsed.data;
  try {
    await prisma.$transaction([
      prisma.item.update({ where: { id: item.id }, data: { name, unit } }),
      prisma.quantityRule.deleteMany({ where: { itemId: item.id, type: RuleType.DEFAULT } }),
      prisma.quantityRule.create({ data: { itemId: item.id, type: RuleType.DEFAULT, min, max } }),
    ]);
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { name: "This section already has an item with this name" } };
    throw e;
  }
  refresh();
  return saved();
}

export async function setItemActive(fd: FormData): Promise<void> {
  const { current } = await requireAdmin();
  const item = await getOwnedItem(current.cafeId, str(fd, "itemId"));
  // Rules are kept when an item is deactivated; only the flag changes.
  await prisma.item.update({ where: { id: item.id }, data: { active: str(fd, "active") === "true" } });
  refresh();
}

export async function moveItem(fd: FormData): Promise<void> {
  const { current } = await requireAdmin();
  const item = await getOwnedItem(current.cafeId, str(fd, "itemId"));
  const siblings = await prisma.item.findMany({
    where: { sectionId: item.sectionId, active: item.active },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  const order = reorder(siblings.map((s) => s.id), item.id, str(fd, "direction") === "up" ? "up" : "down");
  if (!order) return;
  await prisma.$transaction(order.map((id, sortOrder) => prisma.item.update({ where: { id }, data: { sortOrder } })));
  refresh();
}

// ------------------------------------------------------------------- Rules

/** Sets the same min/max for each selected weekday (one rule row per day). */
export async function setWeekdayRules(itemId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireAdmin();
  const item = await getOwnedItem(current.cafeId, itemId);
  const parsed = parseForm(weekdayRuleSchema, { days: days(fd), min: str(fd, "min"), max: str(fd, "max") });
  if (!parsed.data) return parsed.state;
  const { days: weekdays, min, max } = parsed.data;
  await prisma.$transaction([
    prisma.quantityRule.deleteMany({ where: { itemId: item.id, type: RuleType.WEEKDAY, weekday: { in: weekdays } } }),
    prisma.quantityRule.createMany({
      data: weekdays.map((weekday) => ({ itemId: item.id, type: RuleType.WEEKDAY, weekday, min, max })),
    }),
  ]);
  refresh();
  return saved();
}

/** Removes a weekday override so that day goes back to the default. */
export async function clearWeekdayRule(fd: FormData): Promise<void> {
  const { current } = await requireAdmin();
  const item = await getOwnedItem(current.cafeId, str(fd, "itemId"));
  const weekday = Number(str(fd, "weekday"));
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return;
  await prisma.quantityRule.deleteMany({ where: { itemId: item.id, type: RuleType.WEEKDAY, weekday } });
  refresh();
}

export async function setDateRule(itemId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireAdmin();
  const item = await getOwnedItem(current.cafeId, itemId);
  const parsed = parseForm(dateRuleSchema, { date: str(fd, "date"), min: str(fd, "min"), max: str(fd, "max") });
  if (!parsed.data) return parsed.state;
  const date = dateOnly(parsed.data.date);
  await prisma.$transaction([
    prisma.quantityRule.deleteMany({ where: { itemId: item.id, type: RuleType.DATE, date } }),
    prisma.quantityRule.create({
      data: { itemId: item.id, type: RuleType.DATE, date, min: parsed.data.min, max: parsed.data.max },
    }),
  ]);
  refresh();
  return saved();
}

export async function removeDateRule(fd: FormData): Promise<void> {
  const { current } = await requireAdmin();
  const item = await getOwnedItem(current.cafeId, str(fd, "itemId"));
  await prisma.quantityRule.deleteMany({
    where: { id: str(fd, "ruleId"), itemId: item.id, type: RuleType.DATE },
  });
  refresh();
}
