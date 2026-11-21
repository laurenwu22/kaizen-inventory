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
const actions = await import("@/app/(app)/admin/actions");

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
  await prisma.submission.deleteMany({ where: { cafeId: { in: cafeIds } } });
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

  /** Form data for the item editor. */
  const itemFd = (
    over: Partial<Record<"name" | "unit" | "min" | "max", string>> & {
      weekdays?: { day: number; min: string; max: string }[];
      dates?: { date: string; min: string; max: string }[];
    } = {},
  ) =>
    fd({
      name: over.name ?? "Bananas",
      unit: over.unit ?? "bunch",
      min: over.min ?? "2",
      max: over.max ?? "4",
      weekdays: JSON.stringify(over.weekdays ?? []),
      dates: JSON.stringify(over.dates ?? []),
    });

  it("won't create an item without valid default min/max", async () => {
    let r = await run(() => actions.createItem(sectionId, {}, itemFd({ min: "" })));
    expect(r.result?.fieldErrors?.min).toBeTruthy();
    r = await run(() => actions.createItem(sectionId, {}, itemFd({ min: "5", max: "4" })));
    expect(r.result?.fieldErrors?.max).toMatch(/more than max/);
    for (const bad of ["-1", "1.234", "abc"]) {
      r = await run(() => actions.createItem(sectionId, {}, itemFd({ min: bad })));
      expect(r.result?.fieldErrors?.min, bad).toBeTruthy();
    }
    expect(await prisma.item.count({ where: { sectionId } })).toBe(0);
  });

  it("rejects bad custom days and one-time dates, saving nothing", async () => {
    let r = await run(() =>
      actions.createItem(sectionId, {}, itemFd({ weekdays: [{ day: 6, min: "7", max: "6" }] })),
    );
    expect(r.result?.fieldErrors?.weekdays).toMatch(/Saturday/);
    r = await run(() =>
      actions.createItem(sectionId, {}, itemFd({ weekdays: [{ day: 6, min: "1", max: "2" }, { day: 6, min: "1", max: "2" }] })),
    );
    expect(r.result?.fieldErrors?.weekdays).toMatch(/twice/);
    r = await run(() => actions.createItem(sectionId, {}, itemFd({ dates: [{ date: "2020-01-01", min: "1", max: "2" }] })));
    expect(r.result?.fieldErrors?.dates).toMatch(/past/);
    r = await run(() => actions.createItem(sectionId, {}, fd({ name: "X", unit: "box", min: "1", max: "2", weekdays: "not json", dates: "[]" })));
    expect(r.result?.fieldErrors?.weekdays).toBeTruthy();
    expect(await prisma.item.count({ where: { sectionId } })).toBe(0);
  });

  it("creates an item with default, custom days (one row per day) and one-time dates together", async () => {
    const r = await run(() =>
      actions.createItem(
        sectionId,
        {},
        itemFd({
          min: "0.5",
          max: "4",
          weekdays: [5, 6, 0].map((day) => ({ day, min: "3", max: "6" })),
          dates: [{ date: "2027-02-13", min: "5", max: "5" }],
        }),
      ),
    );
    expect(r.result?.ok).toBe(true);
    const item = await prisma.item.findFirstOrThrow({ where: { sectionId, name: "Bananas" } });
    itemId = item.id;
    const rules = await rulesOf(itemId);
    expect(rules.filter((x) => x.type === "DEFAULT").map((x) => Number(x.min))).toEqual([0.5]);
    expect(rules.filter((x) => x.type === "WEEKDAY").map((x) => x.weekday)).toEqual([0, 5, 6]);
    expect(rules.filter((x) => x.type === "DATE")).toHaveLength(1);
  });

  it("adds new items at the bottom and reorders items", async () => {
    await run(() => actions.createItem(sectionId, {}, itemFd({ name: "Apples" })));
    await run(() => actions.createItem(sectionId, {}, itemFd({ name: "Zucchini" })));
    const order = async () =>
      (await prisma.item.findMany({ where: { sectionId }, orderBy: { sortOrder: "asc" } })).map((i) => i.name);
    expect(await order()).toEqual(["Bananas", "Apples", "Zucchini"]); // not alphabetical: newest last
    const zucchini = await prisma.item.findFirstOrThrow({ where: { sectionId, name: "Zucchini" } });
    await run(() => actions.moveItem(fd({ itemId: zucchini.id, direction: "up" })));
    expect(await order()).toEqual(["Bananas", "Zucchini", "Apples"]);
    await run(() => actions.moveItem(fd({ itemId: zucchini.id, direction: "up" })));
    await run(() => actions.moveItem(fd({ itemId: zucchini.id, direction: "up" }))); // already first: no change
    expect(await order()).toEqual(["Zucchini", "Bananas", "Apples"]);
    for (const name of ["Apples", "Zucchini"]) {
      const it = await prisma.item.findFirstOrThrow({ where: { sectionId, name } });
      await run(() => actions.deleteItem(it.id));
    }
  });

  it("rejects a duplicate item name in the same section", async () => {
    const r = await run(() => actions.createItem(sectionId, {}, itemFd()));
    expect(r.result?.fieldErrors?.name).toMatch(/already has/);
  });

  it("saving the editor replaces default, custom days and upcoming dates", async () => {
    const r = await run(() =>
      actions.updateItem(
        itemId,
        {},
        itemFd({
          unit: "bunches",
          min: "2",
          max: "4",
          weekdays: [{ day: 6, min: "4", max: "7" }],
          dates: [{ date: "2027-03-01", min: "1", max: "1" }],
        }),
      ),
    );
    expect(r.redirect).toBe(`/admin/sections/${sectionId}`);
    const rules = await rulesOf(itemId);
    expect(rules.filter((x) => x.type === "DEFAULT").map((x) => Number(x.min))).toEqual([2]);
    const weekday = rules.filter((x) => x.type === "WEEKDAY");
    expect(weekday.map((x) => [x.weekday, Number(x.max)])).toEqual([[6, 7]]);
    const dates = rules.filter((x) => x.type === "DATE").map((x) => x.date!.toISOString().slice(0, 10));
    expect(dates).toEqual(["2027-03-01"]);
    expect((await prisma.item.findUniqueOrThrow({ where: { id: itemId } })).unit).toBe("bunches");
  });

  it("keeps past one-time dates when saving", async () => {
    await prisma.quantityRule.create({
      data: { itemId, type: RuleType.DATE, date: new Date("2020-05-05T00:00:00Z"), min: 9, max: 9 },
    });
    await run(() => actions.updateItem(itemId, {}, itemFd()));
    const dates = (await rulesOf(itemId)).filter((x) => x.type === "DATE").map((x) => x.date!.toISOString().slice(0, 10));
    expect(dates).toEqual(["2020-05-05"]);
  });

  it("delete removes the item and all its rules", async () => {
    await run(() => actions.createItem(sectionId, {}, itemFd({ name: "Temp", weekdays: [{ day: 1, min: "1", max: "1" }] })));
    const temp = await prisma.item.findFirstOrThrow({ where: { sectionId, name: "Temp" } });
    const r = await run(() => actions.deleteItem(temp.id));
    expect(r.redirect).toBe(`/admin/sections/${sectionId}`);
    expect(await prisma.item.findUnique({ where: { id: temp.id } })).toBeNull();
    expect(await prisma.quantityRule.count({ where: { itemId: temp.id } })).toBe(0);
  });

  it("delete refuses an item that has been counted", async () => {
    const submission = await prisma.submission.create({
      data: {
        cafeId: ids.cafeA,
        userId: ids.adminA,
        businessDate: new Date("2026-11-20T00:00:00Z"),
        lines: { create: { itemId, currentCount: 1, autoOrder: 3, finalOrder: 3 } },
      },
    });
    const r = await run(() => actions.deleteItem(itemId));
    expect(r.result?.error).toMatch(/counted before/);
    expect(await prisma.item.findUnique({ where: { id: itemId } })).not.toBeNull();
    await prisma.submission.delete({ where: { id: submission.id } });
  });

  it("delete section removes it with its items, rules and extra dates", async () => {
    await run(() => actions.createSection({}, fd({ name: "Temp section", color: "#6b8f71", days: ["1"] })));
    const temp = await prisma.section.findFirstOrThrow({ where: { cafeId: ids.cafeA, name: "Temp section" } });
    await run(() => actions.createItem(temp.id, {}, itemFd({ name: "Temp item", weekdays: [{ day: 2, min: "1", max: "1" }] })));
    await run(() => actions.addExtraDate(temp.id, {}, fd({ date: "2027-02-13" })));
    const tempItem = await prisma.item.findFirstOrThrow({ where: { sectionId: temp.id } });
    const r = await run(() => actions.deleteSection(temp.id));
    expect(r.redirect).toBe("/admin");
    expect(await prisma.section.findUnique({ where: { id: temp.id } })).toBeNull();
    expect(await prisma.item.count({ where: { sectionId: temp.id } })).toBe(0);
    expect(await prisma.quantityRule.count({ where: { itemId: tempItem.id } })).toBe(0);
    expect(await prisma.sectionExtraDate.count({ where: { sectionId: temp.id } })).toBe(0);
  });

  it("delete section refuses a section whose items have been counted", async () => {
    const submission = await prisma.submission.create({
      data: {
        cafeId: ids.cafeA,
        userId: ids.adminA,
        businessDate: new Date("2026-11-20T00:00:00Z"),
        lines: { create: { itemId, currentCount: 1, autoOrder: 3, finalOrder: 3 } },
      },
    });
    const r = await run(() => actions.deleteSection(sectionId));
    expect(r.result?.error).toMatch(/counted before/);
    expect(await prisma.section.findUnique({ where: { id: sectionId } })).not.toBeNull();
    await prisma.submission.delete({ where: { id: submission.id } });
  });

  it("cannot touch cafe B's sections or items by id", async () => {
    const attempts: Array<() => Promise<unknown>> = [
      () => actions.updateSection(ids.sectionB, {}, fd({ name: "Hacked", color: "#6b8f71" })),
      () => actions.setSectionActive(fd({ sectionId: ids.sectionB, active: "false" })),
      () => actions.deleteSection(ids.sectionB),
      () => actions.createItem(ids.sectionB, {}, fd({ name: "X", unit: "box", min: "1", max: "2", weekdays: "[]", dates: "[]" })),
      () => actions.updateItem(ids.itemB, {}, fd({ name: "Hacked", unit: "box", min: "1", max: "2", weekdays: "[]", dates: "[]" })),
      () => actions.deleteItem(ids.itemB),
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
      () => actions.deleteSection(section.id),
      () => actions.createItem(section.id, {}, fd({ name: "X", unit: "box", min: "1", max: "2", weekdays: "[]", dates: "[]" })),
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
