// Employee submit action against the real database (DATABASE_URL in .env).
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
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/db");
const { Role, RuleType } = await import("@/generated/prisma/client");
const { signSession } = await import("@/lib/auth/token");
const { laDateString, weekdayOf } = await import("@/lib/time");
const { submitInventory } = await import("@/app/(app)/inventory/actions");
const { loadCombinedOrder, loadDayAdditions, loadLatestSubmissionSlack } = await import("@/lib/combined-data");

// No "_" or "%" in the tag: Prisma startsWith uses SQL LIKE.
const tag = `test-inv-${Date.now()}`;
const ids = { cafeA: "", cafeB: "", employee: "", bananas: "", milk: "", offItem: "", itemB: "", perishables: "", sectionB: "" };
const today = laDateString();

type Line = { itemId: string; currentCount: string; finalOrder: string; manuallyEdited: boolean; plenty?: boolean };
const submit = async (lines: Line[] | string, added?: { sections?: string[]; items?: string[] }) => {
  const fd = new FormData();
  fd.set("lines", typeof lines === "string" ? lines : JSON.stringify(lines));
  if (added) fd.set("added", JSON.stringify(added));
  try {
    return { result: await submitInventory({}, fd), redirect: null as string | null };
  } catch (e) {
    if (e instanceof Redirect) return { result: undefined, redirect: e.to };
    throw e;
  }
};
/** The most recent saved line for an item. */
const latestLine = (itemId: string) =>
  prisma.submissionLine.findFirstOrThrow({ where: { itemId }, orderBy: { submission: { submittedAt: "desc" } } });

const line = (itemId: string, currentCount: string, over: Partial<Line> = {}): Line => ({
  itemId,
  currentCount,
  finalOrder: "",
  manuallyEdited: false,
  ...over,
});

beforeAll(async () => {
  const [a, b] = await Promise.all([
    prisma.cafe.create({ data: { name: `${tag}-A` } }),
    prisma.cafe.create({ data: { name: `${tag}-B` } }),
  ]);
  ids.cafeA = a.id;
  ids.cafeB = b.id;
  ids.employee = (
    await prisma.user.create({
      data: {
        firstName: `${tag}-emp`,
        lastName: "Test",
        pin: String(60000000 + Math.floor(Math.random() * 9999999)),
        cafes: { create: { cafeId: a.id, role: Role.EMPLOYEE } },
      },
    })
  ).id;
  const per = await prisma.section.create({ data: { cafeId: a.id, name: "Perishables", daysOfWeek: [] } });
  ids.perishables = per.id;
  const off = await prisma.section.create({ data: { cafeId: a.id, name: "Retired", active: false } });
  const secB = await prisma.section.create({ data: { cafeId: b.id, name: "B" } });
  ids.sectionB = secB.id;
  const mk = (sectionId: string, name: string, rules: { type: (typeof RuleType)[keyof typeof RuleType]; weekday?: number; min: number; max: number }[]) =>
    prisma.item.create({ data: { sectionId, name, unit: "units", rules: { create: rules } } });
  // Bananas: default 2-4, but today's weekday is 3-6 so the server must use today's rule.
  ids.bananas = (
    await mk(per.id, "Bananas", [
      { type: RuleType.DEFAULT, min: 2, max: 4 },
      { type: RuleType.WEEKDAY, weekday: weekdayOf(today), min: 3, max: 6 },
    ])
  ).id;
  ids.milk = (await mk(per.id, "Milk", [{ type: RuleType.DEFAULT, min: 0.5, max: 2 }])).id;
  ids.offItem = (await mk(off.id, "Old thing", [{ type: RuleType.DEFAULT, min: 1, max: 2 }])).id;
  ids.itemB = (await mk(secB.id, "Other cafe item", [{ type: RuleType.DEFAULT, min: 1, max: 2 }])).id;
  cookieValue = await signSession({ userId: ids.employee, cafeId: a.id });
});

afterAll(async () => {
  const cafeIds = [ids.cafeA, ids.cafeB].filter(Boolean);
  await prisma.submission.deleteMany({ where: { cafeId: { in: cafeIds } } });
  await prisma.dayAddition.deleteMany({ where: { cafeId: { in: cafeIds } } });
  await prisma.quantityRule.deleteMany({ where: { item: { section: { cafeId: { in: cafeIds } } } } });
  await prisma.item.deleteMany({ where: { section: { cafeId: { in: cafeIds } } } });
  await prisma.section.deleteMany({ where: { cafeId: { in: cafeIds } } });
  await prisma.userCafe.deleteMany({ where: { cafeId: { in: cafeIds } } });
  await prisma.user.deleteMany({ where: { firstName: { startsWith: tag } } });
  await prisma.cafe.deleteMany({ where: { id: { in: cafeIds } } });
  await prisma.$disconnect();
});

describe("submitInventory", () => {
  it("saves one submission with today's business date and server-computed orders", async () => {
    const r = await submit([line(ids.bananas, "2"), line(ids.milk, "1")]);
    expect(r.result?.submitted?.counted).toBe(2);
    // Bananas today: 3-6, count 2 is below min -> order 4. Milk 0.5-2, count 1 > min -> 0.
    expect(Number((await latestLine(ids.milk)).finalOrder)).toBe(0);
    const sub = await prisma.submission.findFirstOrThrow({
      where: { cafeId: ids.cafeA },
      orderBy: { submittedAt: "desc" },
      include: { lines: true },
    });
    expect(sub.userId).toBe(ids.employee);
    expect(sub.businessDate.toISOString().slice(0, 10)).toBe(today);
    const b = sub.lines.find((l) => l.itemId === ids.bananas)!;
    expect([Number(b.currentCount), Number(b.autoOrder), Number(b.finalOrder), b.manuallyEdited]).toEqual([2, 4, 4, false]);
  });

  it("orders nothing when stock is exactly at the minimum", async () => {
    await submit([line(ids.bananas, "3")]); // today's min is 3
    expect(Number((await latestLine(ids.bananas)).finalOrder)).toBe(0);
  });

  it("rounds the automatic order up to a whole number", async () => {
    await submit([line(ids.bananas, "2.5")]); // bananas today 3-6: 6 - 2.5 = 3.5 -> 4
    expect(Number((await latestLine(ids.bananas)).finalOrder)).toBe(4);
  });

  it("ignores a tampered order amount unless it's marked as manually edited", async () => {
    await submit([line(ids.bananas, "1", { finalOrder: "99" })]);
    expect(Number((await latestLine(ids.bananas)).finalOrder)).toBe(5); // 6 - 1
  });

  it("keeps a manual edit and records it", async () => {
    await submit([line(ids.bananas, "1", { finalOrder: "2", manuallyEdited: true })]);
    const l = await prisma.submissionLine.findFirstOrThrow({
      where: { itemId: ids.bananas },
      orderBy: { submission: { submittedAt: "desc" } },
    });
    expect([Number(l.autoOrder), Number(l.finalOrder), l.manuallyEdited]).toEqual([5, 2, true]);
  });

  it("an edit that matches the automatic amount isn't flagged as manual", async () => {
    await submit([line(ids.bananas, "1", { finalOrder: "5", manuallyEdited: true })]);
    const l = await prisma.submissionLine.findFirstOrThrow({
      where: { itemId: ids.bananas },
      orderBy: { submission: { submittedAt: "desc" } },
    });
    expect(l.manuallyEdited).toBe(false);
  });

  it("rejects bad input without saving", async () => {
    const before = await prisma.submission.count({ where: { cafeId: ids.cafeA } });
    const cases: [Line[] | string, RegExp][] = [
      [[], /at least one/],
      ["not json", /couldn't be read/],
      [[line(ids.bananas, "-1")], /Check the count/],
      [[line(ids.bananas, "1.234")], /Check the count/],
      [[line(ids.bananas, "1", { finalOrder: "abc", manuallyEdited: true })], /whole number/],
      [[line(ids.bananas, "1", { finalOrder: "2.5", manuallyEdited: true })], /whole number/],
      [[line(ids.bananas, "1"), line(ids.bananas, "2")], /twice/],
      [[line(ids.itemB, "1")], /changed since/], // another cafe's item
      [[line(ids.offItem, "1")], /changed since/], // inactive section
      [[line("does-not-exist", "1")], /changed since/],
    ];
    for (const [lines, msg] of cases) {
      expect((await submit(lines)).result?.error, JSON.stringify(lines)).toMatch(msg);
    }
    expect(await prisma.submission.count({ where: { cafeId: ids.cafeA } })).toBe(before);
    expect(await prisma.submission.count({ where: { cafeId: ids.cafeB } })).toBe(0);
  });

  it("signed out or wrong cafe is refused", async () => {
    const saved = cookieValue;
    cookieValue = undefined;
    expect((await submit([line(ids.bananas, "1")])).redirect).toBe("/");
    cookieValue = await signSession({ userId: ids.employee, cafeId: ids.cafeB }); // not a member of B
    expect((await submit([line(ids.itemB, "1")])).redirect).toBe("/select-cafe");
    cookieValue = saved;
    expect(await prisma.submission.count({ where: { cafeId: ids.cafeB } })).toBe(0);
  });
});

describe("Plenty", () => {
  it("saves an item marked Plenty with no count and nothing to order", async () => {
    const r = await submit([{ ...line(ids.milk, ""), plenty: true } as Line]);
    expect(r.result?.submitted?.counted).toBe(1);
    const l = await latestLine(ids.milk);
    expect([l.currentCount, Number(l.autoOrder), Number(l.finalOrder), l.wellStocked]).toEqual([null, 0, 0, true]);
  });

  it("ignores a count or order sent along with Plenty", async () => {
    await submit([{ ...line(ids.bananas, "0", { finalOrder: "9", manuallyEdited: true }), plenty: true } as Line]);
    const l = await latestLine(ids.bananas);
    expect([l.currentCount, Number(l.finalOrder), l.wellStocked]).toEqual([null, 0, true]);
  });

  it("a later Plenty removes an earlier order from the combined order (latest wins)", async () => {
    await submit([line(ids.bananas, "0")]); // orders 6
    await submit([{ ...line(ids.bananas, ""), plenty: true } as Line]);
    const order = await loadCombinedOrder(ids.cafeA, today);
    expect(order.sections.flatMap((s) => s.lines.map((l) => l.name))).not.toContain("Bananas");
  });

  it("the database rejects a Plenty line that has a count or an order", async () => {
    const sub = await prisma.submission.create({ data: { cafeId: ids.cafeA, userId: ids.employee, businessDate: new Date(`${today}T00:00:00Z`) } });
    await expect(
      prisma.submissionLine.create({ data: { submissionId: sub.id, itemId: ids.milk, currentCount: 2, autoOrder: 0, finalOrder: 0, wellStocked: true } }),
    ).rejects.toThrow();
    await expect(
      prisma.submissionLine.create({ data: { submissionId: sub.id, itemId: ids.milk, currentCount: null, autoOrder: 0, finalOrder: 3, wellStocked: true } }),
    ).rejects.toThrow();
    await expect(
      prisma.submissionLine.create({ data: { submissionId: sub.id, itemId: ids.milk, currentCount: null, autoOrder: 0, finalOrder: 0, wellStocked: false } }),
    ).rejects.toThrow();
    await prisma.submission.delete({ where: { id: sub.id } });
  });
});

describe("sections and items added for today", () => {
  it("are recorded with the submission and shared with who added them", async () => {
    await submit([line(ids.bananas, "3")], { sections: [ids.perishables], items: [ids.milk] });
    const shared = await loadDayAdditions(ids.cafeA, today);
    expect(shared.sections[ids.perishables]).toBe(`${tag}-emp`);
    expect(shared.items[ids.milk]).toBe(`${tag}-emp`);
  });

  it("adding the same section again doesn't duplicate it", async () => {
    await submit([line(ids.bananas, "3")], { sections: [ids.perishables] });
    expect(await prisma.dayAddition.count({ where: { cafeId: ids.cafeA, sectionId: ids.perishables } })).toBe(1);
  });

  it("ignores another cafe's sections/items and inactive ones", async () => {
    await submit([line(ids.bananas, "3")], { sections: [ids.sectionB], items: [ids.itemB, ids.offItem] });
    expect(await prisma.dayAddition.count({ where: { OR: [{ sectionId: ids.sectionB }, { itemId: { in: [ids.itemB, ids.offItem] } }] } })).toBe(0);
  });

  it("aren't shared until submitted (nothing recorded on a failed submit)", async () => {
    const before = await prisma.dayAddition.count({ where: { cafeId: ids.cafeA } });
    const r = await submit([line(ids.bananas, "-1")], { items: [ids.bananas] });
    expect(r.result?.error).toBeTruthy();
    expect(await prisma.dayAddition.count({ where: { cafeId: ids.cafeA } })).toBe(before);
  });

  it("the database allows exactly one of section or item", async () => {
    await expect(
      prisma.dayAddition.create({ data: { cafeId: ids.cafeA, businessDate: new Date(`${today}T00:00:00Z`), addedById: ids.employee } }),
    ).rejects.toThrow();
    await expect(
      prisma.dayAddition.create({
        data: { cafeId: ids.cafeA, businessDate: new Date(`${today}T00:00:00Z`), addedById: ids.employee, sectionId: ids.perishables, itemId: ids.milk },
      }),
    ).rejects.toThrow();
  });
});

describe("Copy for Slack below Submit", () => {
  it("covers only what was just submitted, and the page falls back to the latest submission", async () => {
    await submit([line(ids.bananas, "0")]); // earlier: Bananas 6
    const r = await submit([line(ids.milk, "0")]); // latest: Milk 2 only
    expect(r.result?.submitted?.slack).toContain("- Milk: 2 units");
    expect(r.result?.submitted?.slack).not.toContain("Bananas");
    const latest = await loadLatestSubmissionSlack(ids.cafeA, today);
    expect(latest).toBe(r.result?.submitted?.slack);
  });

  it("says Nothing to order when the submission ordered nothing", async () => {
    const r = await submit([line(ids.milk, "5")]);
    expect(r.result?.submitted?.slack).toMatch(/Nothing to order\.$/);
  });
});

describe("loadCombinedOrder", () => {
  it("merges only this cafe's submissions for that day, latest count winning", async () => {
    const yesterday = new Date(new Date(`${today}T00:00:00Z`).getTime() - 86400000);
    // Yesterday at cafe A and today at cafe B must both be ignored.
    await prisma.submission.create({
      data: { cafeId: ids.cafeA, userId: ids.employee, businessDate: yesterday, lines: { create: { itemId: ids.milk, currentCount: 0, autoOrder: 2, finalOrder: 7 } } },
    });
    await prisma.submission.create({
      data: { cafeId: ids.cafeB, userId: ids.employee, businessDate: new Date(`${today}T00:00:00Z`), lines: { create: { itemId: ids.itemB, currentCount: 0, autoOrder: 2, finalOrder: 2 } } },
    });
    await submit([line(ids.bananas, "1"), line(ids.milk, "5")]); // latest today: bananas 5, milk 0
    const order = await loadCombinedOrder(ids.cafeA, today);
    const lines = order.sections.flatMap((s) => s.lines.map((l) => `${l.name}:${l.order}`));
    expect(lines).toEqual(["Bananas:5"]); // milk's latest count is 0; yesterday's 7 and cafe B ignored
    expect(order.submissions.every((s) => s.by.startsWith(tag) && s.by.endsWith(" Test"))).toBe(true); // full name
  });
});
