// Order history queries against the real database (DATABASE_URL in .env).
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { prisma } = await import("@/lib/db");
const { Role, RuleType } = await import("@/generated/prisma/client");
const { loadItemHistory, loadMonthDots } = await import("@/lib/history-data");

// No "_" or "%" in the tag: Prisma startsWith uses SQL LIKE.
const tag = `test-hist-${Date.now()}`;
const ids = { A: "", B: "", maria: "", dev: "", bananas: "", mint: "", whole: "", oldItem: "", itemB: "" };
const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const at = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00-08:00`);

beforeAll(async () => {
  const [a, b] = await Promise.all(["A", "B"].map((n) => prisma.cafe.create({ data: { name: `${tag}-${n}` } })));
  ids.A = a.id;
  ids.B = b.id;
  const pin = () => String(50000000 + Math.floor(Math.random() * 9999999));
  ids.maria = (await prisma.user.create({ data: { firstName: `${tag}-Maria`, lastName: "Lopez", pin: pin(), cafes: { create: { cafeId: a.id, role: Role.EMPLOYEE } } } })).id;
  ids.dev = (await prisma.user.create({ data: { firstName: `${tag}-Dev`, lastName: "Patel", pin: pin(), cafes: { create: [{ cafeId: a.id }, { cafeId: b.id }] } } })).id;
  const per = await prisma.section.create({ data: { cafeId: a.id, name: "Perishables", color: "#6b8f71", sortOrder: 0 } });
  const milk = await prisma.section.create({ data: { cafeId: a.id, name: "Milk", color: "#4f7896", sortOrder: 1 } });
  const retired = await prisma.section.create({ data: { cafeId: a.id, name: "Retired", active: false, sortOrder: 2 } });
  const secB = await prisma.section.create({ data: { cafeId: b.id, name: "B" } });
  const mk = (sectionId: string, name: string) =>
    prisma.item.create({ data: { sectionId, name, unit: "units", rules: { create: { type: RuleType.DEFAULT, min: 1, max: 2 } } } });
  ids.bananas = (await mk(per.id, "Bananas")).id;
  ids.mint = (await mk(per.id, "Mint")).id;
  ids.whole = (await mk(milk.id, "Whole")).id;
  ids.oldItem = (await mk(retired.id, "Old syrup")).id;
  ids.itemB = (await mk(secB.id, "Bananas B")).id;

  const sub = (cafeId: string, userId: string, ymd: string, hhmm: string, lines: [string, number][]) =>
    prisma.submission.create({
      data: {
        cafeId,
        userId,
        businessDate: day(ymd),
        submittedAt: at(ymd, hhmm),
        lines: { create: lines.map(([itemId, finalOrder]) => ({ itemId, currentCount: 1, autoOrder: finalOrder, finalOrder })) },
      },
    });
  await sub(a.id, ids.maria, "2026-11-02", "09:00", [[ids.bananas, 3], [ids.oldItem, 2]]);
  await sub(a.id, ids.dev, "2026-11-10", "10:00", [[ids.bananas, 2], [ids.whole, 20]]);
  await sub(a.id, ids.maria, "2026-11-18", "11:00", [[ids.bananas, 0], [ids.mint, 0]]); // counted, nothing ordered
  await sub(b.id, ids.dev, "2026-11-10", "12:00", [[ids.itemB, 9]]); // other cafe
});

afterAll(async () => {
  const cafeIds = [ids.A, ids.B].filter(Boolean);
  await prisma.submission.deleteMany({ where: { cafeId: { in: cafeIds } } });
  await prisma.quantityRule.deleteMany({ where: { item: { section: { cafeId: { in: cafeIds } } } } });
  await prisma.item.deleteMany({ where: { section: { cafeId: { in: cafeIds } } } });
  await prisma.section.deleteMany({ where: { cafeId: { in: cafeIds } } });
  await prisma.userCafe.deleteMany({ where: { cafeId: { in: cafeIds } } });
  await prisma.user.deleteMany({ where: { firstName: { startsWith: tag } } });
  await prisma.cafe.deleteMany({ where: { id: { in: cafeIds } } });
  await prisma.$disconnect();
});

describe("loadMonthDots", () => {
  it("shows the sections counted each day, in admin order, for this cafe only", async () => {
    const dots = await loadMonthDots(ids.A, "2026-11-01", "2026-11-30");
    const names = Object.fromEntries(Object.entries(dots).map(([d, s]) => [d, s.map((x) => x.name)]));
    expect(names).toEqual({
      "2026-11-02": ["Perishables", "Retired"],
      "2026-11-10": ["Perishables", "Milk"],
      "2026-11-18": ["Perishables"], // counted even though nothing was ordered
    });
    expect(dots["2026-11-10"][1].color).toBe("#4f7896");
  });

  it("only covers the requested range", async () => {
    expect(await loadMonthDots(ids.A, "2026-11-03", "2026-11-17")).toEqual({
      "2026-11-10": expect.any(Array),
    });
  });
});

describe("loadItemHistory", () => {
  it("gives last ordered (order > 0) and last counted, with full names", async () => {
    const items = Object.fromEntries((await loadItemHistory(ids.A)).map((i) => [i.name, i]));
    expect(items.Bananas.lastOrdered).toEqual({ date: "2026-11-10", amount: 2, by: `${tag}-Dev Patel` });
    expect(items.Bananas.lastCounted).toEqual({ date: "2026-11-18", by: `${tag}-Maria Lopez`, plenty: false });
    expect(items.Mint.lastOrdered).toBeNull(); // counted but never ordered -> "Not ordered yet"
    expect(items.Mint.lastCounted?.date).toBe("2026-11-18");
    expect(items.Whole.lastOrdered?.amount).toBe(20);
  });

  it("marks a last check that was Plenty", async () => {
    await prisma.submission.create({
      data: {
        cafeId: ids.A,
        userId: ids.dev,
        businessDate: day("2026-11-19"),
        submittedAt: at("2026-11-19", "09:00"),
        lines: { create: { itemId: ids.whole, currentCount: null, autoOrder: 0, finalOrder: 0, wellStocked: true } },
      },
    });
    const whole = (await loadItemHistory(ids.A)).find((i) => i.name === "Whole")!;
    expect(whole.lastCounted).toEqual({ date: "2026-11-19", by: `${tag}-Dev Patel`, plenty: true });
    expect(whole.lastOrdered?.date).toBe("2026-11-10"); // Plenty doesn't count as an order
  });

  it("includes inactive items, labeled, and leaves out other cafes", async () => {
    const items = await loadItemHistory(ids.A);
    expect(items.map((i) => i.name)).toEqual(["Bananas", "Mint", "Old syrup", "Whole"]); // alphabetical
    expect(items.find((i) => i.name === "Old syrup")).toMatchObject({ inactive: true, lastOrdered: { date: "2026-11-02" } });
    expect(items.find((i) => i.name === "Bananas")?.inactive).toBe(false);
  });
});
