// Admin Server Actions against the real database (DATABASE_URL in .env).
// Next.js request APIs are faked; the session cookie is a real signed token.
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "kaizen_session" && cookieValue ? { name, value: cookieValue } : undefined),
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers(),
}));

class Redirect extends Error {
  constructor(public to: string) {
    super(`redirect ${to}`);
  }
}
class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
  notFound: () => {
    throw new NotFound("not found");
  },
}));
vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/db");
const { Role, RuleType } = await import("@/generated/prisma/client");
const { signSession } = await import("@/lib/auth/token");
const actions = await import("@/app/admin/actions");

// No "_" or "%" in the tag: Prisma startsWith uses SQL LIKE.
const tag = `test-admin-${Date.now()}`;
const ids = { cafeA: "", cafeB: "", adminA: "", employeeA: "", adminB: "", sectionB: "", itemB: "" };

const fd = (fields: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, x);
  return f;
};
async function as(userId: string, cafeId: string) {
  cookieValue = await signSession({ userId, cafeId });
}
/** Runs an action and reports how it ended. */
async function run<T>(fn: () => Promise<T>) {
  try {
    return { result: await fn(), redirect: null as string | null, notFound: false };
  } catch (e) {
    if (e instanceof Redirect) return { result: undefined, redirect: e.to, notFound: false };
    if (e instanceof NotFound) return { result: undefined, redirect: null, notFound: true };
    throw e;
  }
}
const rulesOf = (itemId: string) => prisma.quantityRule.findMany({ where: { itemId }, orderBy: { weekday: "asc" } });

beforeAll(async () => {
  const [a, b] = await Promise.all([
    prisma.cafe.create({ data: { name: `${tag}-A` } }),
    prisma.cafe.create({ data: { name: `${tag}-B` } }),
  ]);
  ids.cafeA = a.id;
  ids.cafeB = b.id;
  const base = String(Date.now()).slice(-5);
  const mk = (n: string, pin: string, cafeId: string, role: (typeof Role)[keyof typeof Role]) =>
    prisma.user.create({
      data: { firstName: `${tag}-${n}`, lastName: "Test", pin, cafes: { create: { cafeId, role } } },
    });
  ids.adminA = (await mk("adminA", `8${base}1`, a.id, Role.ADMIN)).id;
  ids.employeeA = (await mk("employeeA", `8${base}2`, a.id, Role.EMPLOYEE)).id;
  ids.adminB = (await mk("adminB", `8${base}3`, b.id, Role.ADMIN)).id;
  const sectionB = await prisma.section.create({ data: { cafeId: b.id, name: "B stuff" } });
  ids.sectionB = sectionB.id;
  ids.itemB = (
    await prisma.item.create({
      data: { sectionId: sectionB.id, name: "B item", unit: "box", rules: { create: { type: RuleType.DEFAULT, min: 1, max: 2 } } },
    })
  ).id;
});

afterAll(async () => {
  const cafeIds = [ids.cafeA, ids.cafeB].filter(Boolean);
  const where = { item: { section: { cafeId: { in: cafeIds } } } };
  await prisma.quantityRule.deleteMany({ where });
  await prisma.item.deleteMany({ where: { section: { cafeId: { in: cafeIds } } } });
  await prisma.sectionExtraDate.deleteMany({ where: { section: { cafeId: { in: cafeIds } } } });
  await prisma.section.deleteMany({ where: { cafeId: { in: cafeIds } } });
  await prisma.userCafe.deleteMany({ where: { cafeId: { in: cafeIds } } });
  await prisma.user.deleteMany({ where: { firstName: { startsWith: tag } } });
  await prisma.cafe.deleteMany({ where: { id: { in: cafeIds } } });
  await prisma.$disconnect();
});

describe("admin at cafe A", () => {
  let sectionId = "";
  let itemId = "";

  it("creates sections in order", async () => {
    await as(ids.adminA, ids.cafeA);
    const r = await run(() =>
      actions.createSection({}, fd({ name: "Perishables", color: "#6b8f71", days: ["1", "3", "5"] })),
    );
    expect(r.redirect).toMatch(/^\/admin\/sections\//);
    sectionId = r.redirect!.split("/").pop()!;
    const s = await prisma.section.findUniqueOrThrow({ where: { id: sectionId } });
    expect(s).toMatchObject({ cafeId: ids.cafeA, daysOfWeek: [1, 3, 5], sortOrder: 0 });
    await run(() => actions.createSection({}, fd({ name: "Milk", color: "#4f7896", days: [] })));
    const milk = await prisma.section.findFirstOrThrow({ where: { cafeId: ids.cafeA, name: "Milk" } });
    expect(milk.sortOrder).toBe(1);
  });

  it("rejects a duplicate name, missing name and unknown color", async () => {
    let r = await run(() => actions.createSection({}, fd({ name: "Perishables", color: "#6b8f71" })));
    expect(r.result?.fieldErrors?.name).toMatch(/already exists/);
    r = await run(() => actions.createSection({}, fd({ name: "  ", color: "#6b8f71" })));
    expect(r.result?.fieldErrors?.name).toBeTruthy();
    r = await run(() => actions.createSection({}, fd({ name: "Cups", color: "#ff0000" })));
    expect(r.result?.fieldErrors?.color).toBeTruthy();
  });

  it("reorders sections", async () => {
    await run(() => actions.moveSection(fd({ sectionId, direction: "down" })));
    const order = await prisma.section.findMany({ where: { cafeId: ids.cafeA }, orderBy: { sortOrder: "asc" } });
    expect(order.map((s) => s.name)).toEqual(["Milk", "Perishables"]);
  });

  it("adds and removes extra dates", async () => {
    await run(() => actions.addExtraDate(sectionId, {}, fd({ date: "2027-02-13" })));
    await run(() => actions.addExtraDate(sectionId, {}, fd({ date: "2027-02-13" }))); // duplicate is ignored
    expect(await prisma.sectionExtraDate.count({ where: { sectionId } })).toBe(1);
    const bad = await run(() => actions.addExtraDate(sectionId, {}, fd({ date: "2027-02-30" })));
    expect(bad.result?.fieldErrors?.date).toBeTruthy();
    await run(() => actions.removeExtraDate(fd({ sectionId, date: "2027-02-13" })));
    expect(await prisma.sectionExtraDate.count({ where: { sectionId } })).toBe(0);
  });

  it("won't create an item without valid default min/max", async () => {
    let r = await run(() => actions.createItem(sectionId, {}, fd({ name: "Bananas", unit: "bunch", min: "", max: "4" })));
    expect(r.result?.fieldErrors?.min).toBeTruthy();
    r = await run(() => actions.createItem(sectionId, {}, fd({ name: "Bananas", unit: "bunch", min: "5", max: "4" })));
    expect(r.result?.fieldErrors?.max).toMatch(/more than max/);
    for (const bad of ["-1", "1.234", "abc"]) {
      r = await run(() => actions.createItem(sectionId, {}, fd({ name: "Bananas", unit: "bunch", min: bad, max: "4" })));
      expect(r.result?.fieldErrors?.min, bad).toBeTruthy();
    }
    expect(await prisma.item.count({ where: { sectionId } })).toBe(0);
  });

  it("creates an item with its default rule (decimals allowed)", async () => {
    const r = await run(() => actions.createItem(sectionId, {}, fd({ name: "Bananas", unit: "bunch", min: "0.5", max: "4" })));
    expect(r.redirect).toMatch(/^\/admin\/items\//);
    itemId = r.redirect!.split("/").pop()!;
    const rules = await rulesOf(itemId);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ type: "DEFAULT" });
    expect(Number(rules[0].min)).toBe(0.5);
  });

  it("weekday group creates one row per day, and re-applying updates instead of duplicating", async () => {
    await run(() => actions.setWeekdayRules(itemId, {}, fd({ days: ["5", "6", "0"], min: "3", max: "6" })));
    let weekday = (await rulesOf(itemId)).filter((r) => r.type === "WEEKDAY");
    expect(weekday.map((r) => r.weekday)).toEqual([0, 5, 6]);
    await run(() => actions.setWeekdayRules(itemId, {}, fd({ days: ["6"], min: "4", max: "7" })));
    weekday = (await rulesOf(itemId)).filter((r) => r.type === "WEEKDAY");
    expect(weekday).toHaveLength(3);
    expect(Number(weekday.find((r) => r.weekday === 6)!.max)).toBe(7);
    const none = await run(() => actions.setWeekdayRules(itemId, {}, fd({ min: "1", max: "2" })));
    expect(none.result?.fieldErrors?.days).toBeTruthy();
  });

  it("resets a weekday back to default", async () => {
    await run(() => actions.clearWeekdayRule(fd({ itemId, weekday: "0" })));
    expect((await rulesOf(itemId)).filter((r) => r.type === "WEEKDAY").map((r) => r.weekday)).toEqual([5, 6]);
  });

  it("one rule per date: setting the same date again updates it", async () => {
    await run(() => actions.setDateRule(itemId, {}, fd({ date: "2027-02-13", min: "5", max: "5" })));
    await run(() => actions.setDateRule(itemId, {}, fd({ date: "2027-02-13", min: "6", max: "6" })));
    const dates = (await rulesOf(itemId)).filter((r) => r.type === "DATE");
    expect(dates).toHaveLength(1);
    expect(Number(dates[0].min)).toBe(6);
    await run(() => actions.removeDateRule(fd({ itemId, ruleId: dates[0].id })));
    expect((await rulesOf(itemId)).filter((r) => r.type === "DATE")).toHaveLength(0);
  });

  it("updates the item and its default", async () => {
    const r = await run(() => actions.updateItem(itemId, {}, fd({ name: "Bananas", unit: "bunches", min: "2", max: "4" })));
    expect(r.result?.ok).toBe(true);
    const defaults = (await rulesOf(itemId)).filter((r) => r.type === "DEFAULT");
    expect(defaults).toHaveLength(1);
    expect(Number(defaults[0].min)).toBe(2);
  });

  it("deactivating an item keeps its rules", async () => {
    const before = (await rulesOf(itemId)).length;
    await run(() => actions.setItemActive(fd({ itemId, active: "false" })));
    expect((await prisma.item.findUniqueOrThrow({ where: { id: itemId } })).active).toBe(false);
    expect((await rulesOf(itemId)).length).toBe(before);
    await run(() => actions.setItemActive(fd({ itemId, active: "true" })));
  });

  it("cannot touch cafe B's sections or items by id", async () => {
    const attempts: Array<() => Promise<unknown>> = [
      () => actions.updateSection(ids.sectionB, {}, fd({ name: "Hacked", color: "#6b8f71" })),
      () => actions.setSectionActive(fd({ sectionId: ids.sectionB, active: "false" })),
      () => actions.createItem(ids.sectionB, {}, fd({ name: "X", unit: "box", min: "1", max: "2" })),
      () => actions.updateItem(ids.itemB, {}, fd({ name: "Hacked", unit: "box", min: "1", max: "2" })),
      () => actions.setItemActive(fd({ itemId: ids.itemB, active: "false" })),
      () => actions.setWeekdayRules(ids.itemB, {}, fd({ days: ["1"], min: "1", max: "2" })),
      () => actions.setDateRule(ids.itemB, {}, fd({ date: "2027-01-01", min: "1", max: "2" })),
      () => actions.clearWeekdayRule(fd({ itemId: ids.itemB, weekday: "1" })),
      () => actions.moveItem(fd({ itemId: ids.itemB, direction: "up" })),
    ];
    for (const attempt of attempts) expect((await run(attempt)).notFound).toBe(true);
    const sectionB = await prisma.section.findUniqueOrThrow({ where: { id: ids.sectionB } });
    const itemB = await prisma.item.findUniqueOrThrow({ where: { id: ids.itemB } });
    expect(sectionB).toMatchObject({ name: "B stuff", active: true });
    expect(itemB).toMatchObject({ name: "B item", active: true });
    expect(await prisma.quantityRule.count({ where: { itemId: ids.itemB } })).toBe(1);
    expect(await prisma.item.count({ where: { sectionId: ids.sectionB } })).toBe(1);
  });
});

describe("non-admins", () => {
  it("an employee is refused every admin action", async () => {
    await as(ids.employeeA, ids.cafeA);
    const section = await prisma.section.findFirstOrThrow({ where: { cafeId: ids.cafeA } });
    const before = await prisma.section.count({ where: { cafeId: ids.cafeA } });
    const attempts: Array<() => Promise<unknown>> = [
      () => actions.createSection({}, fd({ name: "Sneaky", color: "#6b8f71" })),
      () => actions.updateSection(section.id, {}, fd({ name: "Sneaky", color: "#6b8f71" })),
      () => actions.setSectionActive(fd({ sectionId: section.id, active: "false" })),
      () => actions.createItem(section.id, {}, fd({ name: "X", unit: "box", min: "1", max: "2" })),
    ];
    for (const attempt of attempts) expect((await run(attempt)).redirect).toBe("/inventory");
    expect(await prisma.section.count({ where: { cafeId: ids.cafeA } })).toBe(before);
    expect((await prisma.section.findUniqueOrThrow({ where: { id: section.id } })).active).toBe(true);
  });

  it("signed out is sent to the PIN pad", async () => {
    cookieValue = undefined;
    expect((await run(() => actions.createSection({}, fd({ name: "X", color: "#6b8f71" })))).redirect).toBe("/");
  });
});
