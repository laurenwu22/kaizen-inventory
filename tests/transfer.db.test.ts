// Backup & transfer against the real database: export a test cafe with
// history, delete it, import it back, and check everything matches exactly.
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
const { signSession } = await import("@/lib/auth/token");
const actions = await import("@/app/(app)/backup/actions");
const fmt = await import("@/lib/transfer/format");

const tag = `test-xfer-${Date.now()}`;
const ids = { home: "", cafe: "", manager: "", ana: "", ben: "", section: "", bananas: "", limes: "" };
let pinSeq = Math.floor(Math.random() * 900000) + 3000000;
const nextPin = () => String(pinSeq++);
const as = async (userId: string, cafeId: string) => {
  cookieValue = await signSession({ userId, cafeId });
};

type Backup = import("@/lib/transfer/format").Backup;
async function exportAll(parts = [...fmt.PARTS]): Promise<Backup> {
  const opts = { cafeIds: [ids.cafe], parts, from: null, to: null };
  const base = await actions.exportBaseAction(opts);
  const submissions = [];
  let cursor: string | null = null;
  do {
    const page: Awaited<ReturnType<typeof actions.exportHistoryAction>> = await actions.exportHistoryAction(opts, cursor);
    submissions.push(...page.submissions);
    cursor = page.nextCursor;
  } while (cursor);
  return {
    format: fmt.FORMAT,
    version: fmt.VERSION,
    exportedAt: new Date().toISOString(),
    parts,
    historyRange: null,
    cafes: base.cafes,
    // Only this test's people: other test files run at the same time and
    // their temporary managers must not be re-created by this import.
    people: base.people.filter((p) => p.firstName.startsWith(tag)),
    sections: base.sections,
    submissions,
    additions: base.additions,
  };
}
async function importAll(b: Backup, mode: "keep" | "update" = "keep") {
  const sel = fmt.selectFromBackup(b, b.cafes.map((c) => c.id), b.parts);
  const r = await actions.importBaseAction(sel.base, mode);
  if (!r.ok) throw new Error(r.error);
  const problems = [...r.result.problems];
  let added = 0;
  for (const batch of fmt.batchSubmissions(sel.submissions, 2000, 1)) {
    const h = await actions.importSubmissionsAction(batch, r.result.maps);
    added += h.added;
    problems.push(...h.problems);
  }
  await actions.importAdditionsAction(sel.additions, r.result.maps);
  return { ...r.result, added, problems };
}
/** Only the test cafe's own people (not the org's real managers). */
const strip = (b: Backup) => ({
  cafes: b.cafes,
  people: b.people.filter((p) => p.firstName.startsWith(tag)),
  sections: b.sections,
  submissions: [...b.submissions].sort((x, y) => x.id.localeCompare(y.id)),
  additions: b.additions,
});

async function wipeTestCafe() {
  const cafeIds = (await prisma.cafe.findMany({ where: { name: { startsWith: tag } }, select: { id: true } })).map((c) => c.id);
  await prisma.submission.deleteMany({ where: { cafeId: { in: cafeIds } } });
  await prisma.dayAddition.deleteMany({ where: { cafeId: { in: cafeIds } } });
  await prisma.quantityRule.deleteMany({ where: { item: { section: { cafeId: { in: cafeIds } } } } });
  await prisma.item.deleteMany({ where: { section: { cafeId: { in: cafeIds } } } });
  await prisma.sectionExtraDate.deleteMany({ where: { section: { cafeId: { in: cafeIds } } } });
  await prisma.section.deleteMany({ where: { cafeId: { in: cafeIds } } });
  await prisma.userCafe.deleteMany({ where: { cafeId: { in: cafeIds } } });
  await prisma.user.deleteMany({ where: { firstName: { startsWith: tag }, id: { not: ids.manager } } });
  await prisma.cafe.deleteMany({ where: { id: { in: cafeIds } } });
}

beforeAll(async () => {
  const cafe = await prisma.cafe.create({ data: { name: `${tag}-Cafe` } });
  ids.cafe = cafe.id;
  ids.manager = (await prisma.user.create({ data: { firstName: `${tag}-mgr`, lastName: "Test", pin: nextPin(), isManager: true } })).id;
  ids.ana = (
    await prisma.user.create({
      data: { firstName: `${tag}-ana`, lastName: "Test", pin: nextPin(), cafes: { create: { cafeId: cafe.id, role: "ADMIN" } } },
    })
  ).id;
  ids.ben = (
    await prisma.user.create({
      data: { firstName: `${tag}-ben`, lastName: "Test", pin: nextPin(), active: false, cafes: { create: { cafeId: cafe.id, role: "EMPLOYEE" } } },
    })
  ).id;
  const section = await prisma.section.create({
    data: { cafeId: cafe.id, name: "Produce", color: "#6b8f71", daysOfWeek: [1, 4], sortOrder: 2, extraDates: { create: [{ date: new Date("2026-12-24") }] } },
  });
  ids.section = section.id;
  ids.bananas = (
    await prisma.item.create({
      data: {
        sectionId: section.id,
        name: "Bananas",
        unit: "bunches",
        sortOrder: 0,
        rules: {
          create: [
            { type: "DEFAULT", min: 2, max: 4 },
            { type: "WEEKDAY", weekday: 6, min: 3, max: 6.5 },
            { type: "DATE", date: new Date("2026-12-24"), min: 5, max: 9 },
          ],
        },
      },
    })
  ).id;
  ids.limes = (
    await prisma.item.create({ data: { sectionId: section.id, name: "Limes", unit: "bags", sortOrder: 1, active: false, rules: { create: [{ type: "DEFAULT", min: 1, max: 2 }] } } })
  ).id;
  await prisma.submission.create({
    data: {
      cafeId: cafe.id,
      userId: ids.ana,
      businessDate: new Date("2026-11-20"),
      submittedAt: new Date("2026-11-20T17:03:00Z"),
      lines: {
        create: [
          { itemId: ids.bananas, currentCount: 1.5, autoOrder: 3, finalOrder: 4, manuallyEdited: true },
          { itemId: ids.limes, currentCount: null, autoOrder: 0, finalOrder: 0, wellStocked: true },
        ],
      },
    },
  });
  await prisma.submission.create({
    data: { cafeId: cafe.id, userId: ids.ben, businessDate: new Date("2026-11-21"), lines: { create: [{ itemId: ids.bananas, currentCount: 3, autoOrder: 0, finalOrder: 0 }] } },
  });
  await prisma.dayAddition.create({ data: { cafeId: cafe.id, businessDate: new Date("2026-11-21"), sectionId: section.id, addedById: ids.ben } });
  // The manager works from another cafe, so deleting the test cafe doesn't end their session.
  ids.home = (await prisma.cafe.create({ data: { name: `home-${tag}` } })).id;
  await as(ids.manager, ids.home);
});

afterAll(async () => {
  await wipeTestCafe();
  await prisma.user.deleteMany({ where: { firstName: { startsWith: tag } } });
  await prisma.cafe.deleteMany({ where: { id: ids.home } });
  await prisma.$disconnect();
});

describe("backup round trip", () => {
  let original: Backup;

  it("exports everything for the chosen cafe, plus every manager", async () => {
    const opts = { cafeIds: [ids.cafe], parts: [...fmt.PARTS], from: null, to: null };
    const managers = (await actions.exportBaseAction(opts)).people.filter((p) => p.isManager).map((p) => p.id);
    expect(managers).toContain(ids.manager);
    original = await exportAll();
    const s = strip(original);
    expect(s.cafes.map((c) => c.name)).toEqual([`${tag}-Cafe`]);
    expect(s.people.map((p) => p.firstName).sort()).toEqual([`${tag}-ana`, `${tag}-ben`, `${tag}-mgr`].sort());
    expect(s.sections[0].items).toHaveLength(2);
    expect(s.sections[0].extraDates).toEqual(["2026-12-24"]);
    expect(s.submissions).toHaveLength(2);
    expect(s.additions).toHaveLength(1);
    // It's a valid file.
    expect("backup" in fmt.parseBackup(JSON.stringify(original))).toBe(true);
  });

  it("importing the same file again changes nothing", async () => {
    const r = await importAll(original);
    expect(r.counts.cafes).toEqual({ added: 0, updated: 0, kept: 1 });
    expect(r.counts.items.added).toBe(0);
    expect(r.added).toBe(0);
    expect(await prisma.submission.count({ where: { cafeId: ids.cafe } })).toBe(2);
  });

  it("restores everything exactly after the cafe is gone", async () => {
    await wipeTestCafe();
    expect(await prisma.cafe.findUnique({ where: { id: ids.cafe } })).toBeNull();
    const r = await importAll(original);
    expect(r.problems).toEqual([]);
    expect(r.added).toBe(2);
    const again = await exportAll();
    expect(strip(again)).toEqual(strip(original));
  });

  it("previews without saving anything", async () => {
    const changed = structuredClone(original);
    changed.cafes[0] = { ...changed.cafes[0], id: "preview-cafe-id", name: `${tag}-Preview` };
    const sel = fmt.selectFromBackup(changed, ["preview-cafe-id"], ["sections"]);
    sel.base.sections = sel.base.sections.map((s) => ({ ...s, cafeId: "preview-cafe-id" }));
    const r = await actions.previewImportAction(sel.base, "keep");
    expect(r.ok && r.result.counts.cafes.added).toBe(1);
    expect(await prisma.cafe.findFirst({ where: { name: `${tag}-Preview` } })).toBeNull();
  });
});

describe("keep vs update", () => {
  it("keep leaves changes here alone; update puts the file's version back", async () => {
    const file = await exportAll();
    await prisma.item.update({ where: { id: ids.bananas }, data: { unit: "boxes" } });
    await prisma.quantityRule.deleteMany({ where: { itemId: ids.bananas, type: "WEEKDAY" } });
    await importAll(file, "keep");
    expect((await prisma.item.findUniqueOrThrow({ where: { id: ids.bananas } })).unit).toBe("boxes");
    const r = await importAll(file, "update");
    expect(r.counts.items.updated).toBe(2);
    expect((await prisma.item.findUniqueOrThrow({ where: { id: ids.bananas } })).unit).toBe("bunches");
    expect(await prisma.quantityRule.count({ where: { itemId: ids.bananas } })).toBe(3);
  });
});

describe("matching people", () => {
  it("merges someone with a different id but the same PIN and name (a seeded account)", async () => {
    const file = await exportAll();
    const ana = file.people.find((p) => p.id === ids.ana)!;
    const alias = structuredClone(file);
    alias.people = alias.people.map((p) => (p.id === ids.ana ? { ...p, id: "other-id-for-ana" } : p));
    alias.submissions = alias.submissions.map((s) => (s.userId === ids.ana ? { ...s, userId: "other-id-for-ana", id: `${s.id}-x` } : s));
    const r = await importAll(alias);
    expect(r.maps.people["other-id-for-ana"]).toBe(ids.ana);
    expect(r.problems).toEqual([]);
    const sub = await prisma.submission.findFirstOrThrow({ where: { id: { endsWith: "-x" } } });
    expect(sub.userId).toBe(ids.ana);
    expect(ana.pin).toBeTruthy();
  });

  it("skips someone whose PIN belongs to a different person here, and their history", async () => {
    const file = await exportAll();
    const clash = structuredClone(file);
    const anaPin = file.people.find((p) => p.id === ids.ana)!.pin;
    clash.people = [
      ...clash.people,
      { id: "imposter", firstName: "Someone", lastName: "Else", pin: anaPin, active: true, isManager: false, createdAt: new Date().toISOString(), memberships: [{ cafeId: ids.cafe, role: "EMPLOYEE", createdAt: new Date().toISOString() }] },
    ];
    clash.submissions = [{ ...clash.submissions[0], id: "imposter-sub", userId: "imposter" }];
    const r = await importAll(clash);
    expect(r.problems.some((p) => p.includes("Someone Else was skipped"))).toBe(true);
    expect(r.problems.some((p) => p.includes("person who submitted it"))).toBe(true);
    expect(await prisma.submission.findUnique({ where: { id: "imposter-sub" } })).toBeNull();
  });
});

describe("reading files", () => {
  it("rejects damaged files and files from a newer version", () => {
    expect(fmt.parseBackup("{not json")).toEqual({ error: expect.stringContaining("isn't a Kaizen backup") });
    expect(fmt.parseBackup(JSON.stringify({ format: "other" }))).toEqual({ error: expect.stringContaining("isn't a Kaizen backup") });
    expect(fmt.parseBackup(JSON.stringify({ format: fmt.FORMAT, version: 99 }))).toEqual({ error: expect.stringContaining("newer version") });
    expect(fmt.parseBackup(JSON.stringify({ format: fmt.FORMAT, version: 1, cafes: "x" }))).toEqual({ error: expect.stringContaining("damaged") });
  });

  it("history brings people and sections with it", () => {
    expect([...fmt.withDependencies(["history"])].sort()).toEqual(["history", "people", "sections"]);
  });
});

describe("managers only", () => {
  it("refuses admins and employees", async () => {
    await as(ids.ana, ids.cafe);
    const opts = { cafeIds: [ids.cafe], parts: ["sections"], from: null, to: null };
    await expect(actions.exportBaseAction(opts)).rejects.toThrow("redirect /admin");
    await expect(actions.importBaseAction({ cafes: [], people: [], sections: [] }, "keep")).rejects.toThrow("redirect /admin");
    await prisma.userCafe.update({ where: { userId_cafeId: { userId: ids.ana, cafeId: ids.cafe } }, data: { role: "EMPLOYEE" } });
    await expect(actions.exportHistoryAction(opts, null)).rejects.toThrow("redirect /inventory");
    await as(ids.manager, ids.home);
  });
});
