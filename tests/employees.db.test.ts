// Employee and cafe management (managers only) against the real database.
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
const { Role } = await import("@/generated/prisma/client");
const { signSession } = await import("@/lib/auth/token");
const { loadSession } = await import("@/lib/auth/dal");
const actions = await import("@/app/(app)/admin/employees/actions");
const { createCafe } = await import("@/app/(app)/admin/cafes/actions");

// No "_" or "%" in the tag: Prisma startsWith uses SQL LIKE.
const tag = `test-emp-${Date.now()}`;
const ids = { A: "", B: "", manager: "", adminA: "", emp: "" };
let pinSeq = Math.floor(Math.random() * 900000) + 1000000;
const nextPin = () => String(pinSeq++);

type M = { cafeId: string; role: "EMPLOYEE" | "ADMIN" };
const form = (o: { firstName?: string; lastName?: string; pin?: string; isManager?: boolean; memberships?: M[] | string }) => {
  const f = new FormData();
  f.set("firstName", o.firstName ?? `${tag}-new`);
  f.set("lastName", o.lastName ?? "Person");
  f.set("pin", o.pin ?? nextPin());
  f.set("isManager", o.isManager ? "true" : "false");
  f.set("memberships", typeof o.memberships === "string" ? o.memberships : JSON.stringify(o.memberships ?? [{ cafeId: ids.A, role: "EMPLOYEE" }]));
  return f;
};
async function run<T>(fn: () => Promise<T>) {
  try {
    return { result: await fn(), redirect: null as string | null, notFound: false };
  } catch (e) {
    if (e instanceof Redirect) return { result: undefined, redirect: e.to, notFound: false };
    if (e instanceof NotFound) return { result: undefined, redirect: null, notFound: true };
    throw e;
  }
}
const as = async (userId: string, cafeId: string) => {
  cookieValue = await signSession({ userId, cafeId });
};
const roleAt = async (userId: string, cafeId: string) =>
  (await prisma.userCafe.findUnique({ where: { userId_cafeId: { userId, cafeId } } }))?.role ?? null;
const activeManagers = () => prisma.user.count({ where: { isManager: true, active: true } });

beforeAll(async () => {
  const [a, b] = await Promise.all(["A", "B"].map((n) => prisma.cafe.create({ data: { name: `${tag}-${n}` } })));
  Object.assign(ids, { A: a.id, B: b.id });
  const mk = async (n: string, memberships: M[], isManager = false) =>
    (
      await prisma.user.create({
        data: { firstName: `${tag}-${n}`, lastName: "Test", pin: nextPin(), isManager, cafes: { create: memberships } },
      })
    ).id;
  ids.manager = await mk("manager", [], true); // assigned to no cafe
  ids.adminA = await mk("adminA", [{ cafeId: a.id, role: Role.ADMIN }]);
  ids.emp = await mk("emp", [{ cafeId: a.id, role: Role.EMPLOYEE }]);
  await as(ids.manager, a.id);
});

afterAll(async () => {
  const cafes = await prisma.cafe.findMany({ where: { name: { startsWith: tag } }, select: { id: true } });
  const cafeIds = cafes.map((c) => c.id);
  await prisma.userCafe.deleteMany({ where: { cafeId: { in: cafeIds } } });
  await prisma.user.deleteMany({ where: { firstName: { startsWith: tag } } });
  await prisma.cafe.deleteMany({ where: { id: { in: cafeIds } } });
  await prisma.$disconnect();
});

describe("managers are organization-wide", () => {
  it("a manager with no assigned cafes can open every cafe as an admin", async () => {
    const s = await loadSession({ userId: ids.manager, cafeId: ids.B, issuedAt: 0, expiresAt: 0 });
    expect(s?.user.isManager).toBe(true);
    expect(s?.current?.cafeId).toBe(ids.B);
    expect(s?.current?.role).toBe("ADMIN");
    const mine = s!.memberships.filter((m) => [ids.A, ids.B].includes(m.cafeId));
    expect(mine).toHaveLength(2);
  });
});

describe("adding employees (managers)", () => {
  it("adds a person with roles at any cafes", async () => {
    const pin = nextPin();
    const r = await run(() =>
      actions.createEmployee({}, form({ firstName: `${tag}-maria`, pin, memberships: [{ cafeId: ids.A, role: "ADMIN" }, { cafeId: ids.B, role: "EMPLOYEE" }] })),
    );
    expect(r.result?.ok).toBe(true);
    const u = await prisma.user.findUniqueOrThrow({ where: { pin }, include: { cafes: true } });
    expect(u.cafes.map((m) => [m.cafeId, m.role]).sort()).toEqual([[ids.A, "ADMIN"], [ids.B, "EMPLOYEE"]].sort());
  });

  it("can add a manager with no cafes, but others need at least one", async () => {
    const pin = nextPin();
    expect((await run(() => actions.createEmployee({}, form({ pin, isManager: true, memberships: [] })))).result?.ok).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { pin } })).isManager).toBe(true);
    expect((await run(() => actions.createEmployee({}, form({ memberships: [] })))).result?.fieldErrors?.memberships).toMatch(/at least one cafe/);
  });

  it("rejects duplicate PINs, bad PINs, blank names and unknown cafes", async () => {
    const taken = (await prisma.user.findUniqueOrThrow({ where: { id: ids.emp } })).pin;
    expect((await run(() => actions.createEmployee({}, form({ pin: taken })))).result?.fieldErrors?.pin).toMatch(/already in use/);
    for (const bad of ["12", "123456789", "12a4", ""]) {
      expect((await run(() => actions.createEmployee({}, form({ pin: bad })))).result?.fieldErrors?.pin, bad).toMatch(/3 to 8 digits/);
    }
    const blank = await run(() => actions.createEmployee({}, form({ firstName: " ", lastName: "" })));
    expect(blank.result?.fieldErrors).toMatchObject({ firstName: expect.any(String), lastName: expect.any(String) });
    expect((await run(() => actions.createEmployee({}, form({ memberships: [{ cafeId: "nope", role: "EMPLOYEE" }] })))).result?.fieldErrors?.memberships).toBeTruthy();
  });
});

describe("editing employees (managers)", () => {
  it("updates name, PIN, manager flag and cafes (replacing them)", async () => {
    const pin = nextPin();
    const r = await run(() =>
      actions.updateEmployee(ids.emp, {}, form({ firstName: `${tag}-emp`, lastName: "Renamed", pin, isManager: true, memberships: [{ cafeId: ids.B, role: "ADMIN" }] })),
    );
    expect(r.redirect).toBe("/admin/employees");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: ids.emp } })).toMatchObject({ lastName: "Renamed", pin, isManager: true });
    expect(await roleAt(ids.emp, ids.A)).toBeNull();
    expect(await roleAt(ids.emp, ids.B)).toBe("ADMIN");
    await run(() => actions.updateEmployee(ids.emp, {}, form({ firstName: `${tag}-emp`, memberships: [{ cafeId: ids.A, role: "EMPLOYEE" }] })));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.emp } })).isManager).toBe(false);
  });

  it("can leave a cafe with no admins (managers cover it)", async () => {
    const adminA = await prisma.user.findUniqueOrThrow({ where: { id: ids.adminA } });
    const r = await run(() => actions.updateEmployee(ids.adminA, {}, form({ firstName: adminA.firstName, pin: adminA.pin, memberships: [{ cafeId: ids.A, role: "EMPLOYEE" }] })));
    expect(r.redirect).toBe("/admin/employees");
    expect(await roleAt(ids.adminA, ids.A)).toBe("EMPLOYEE");
  });
});

describe("the last active manager", () => {
  it("the rule throws when no active manager would remain (checked inside the transaction)", async () => {
    const { assertActiveManager } = await import("@/lib/admin/managers");
    const before = await activeManagers();
    // Deactivate every manager inside a transaction, then check. The rule
    // throws, which rolls everything back, so nothing is ever saved.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.user.updateMany({ where: { isManager: true }, data: { active: false } });
        await assertActiveManager(tx);
      }),
    ).rejects.toThrow(/at least one active manager/);
    expect(await activeManagers()).toBe(before);
    // And it passes when a manager remains.
    await prisma.$transaction(async (tx) => assertActiveManager(tx));
  });

  it("deactivating a non-last manager works and their session stops", async () => {
    const pin = nextPin();
    await run(() => actions.createEmployee({}, form({ firstName: `${tag}-mgr2`, pin, isManager: true, memberships: [] })));
    const mgr2 = await prisma.user.findUniqueOrThrow({ where: { pin } });
    expect((await run(() => actions.setEmployeeActive(mgr2.id, false))).redirect).toBe("/admin/employees");
    expect(await loadSession({ userId: mgr2.id, cafeId: ids.A, issuedAt: 0, expiresAt: 0 })).toBeNull();
  });
});

describe("creating cafes (managers)", () => {
  it("creates a cafe with chosen people and roles", async () => {
    const r = await run(() => {
      const f = new FormData();
      f.set("name", `${tag}-Downtown`);
      f.set("members", JSON.stringify([{ userId: ids.adminA, role: "ADMIN" }, { userId: ids.emp, role: "EMPLOYEE" }]));
      return createCafe({}, f);
    });
    expect(r.result?.ok).toBe(true);
    const cafe = await prisma.cafe.findUniqueOrThrow({ where: { name: `${tag}-Downtown` }, include: { members: true } });
    expect(cafe.members.map((m) => [m.userId, m.role]).sort()).toEqual([[ids.adminA, "ADMIN"], [ids.emp, "EMPLOYEE"]].sort());
    // The new cafe shows up in a member's session right away.
    const s = await loadSession({ userId: ids.emp, cafeId: cafe.id, issuedAt: 0, expiresAt: 0 });
    expect(s?.current?.cafeName).toBe(`${tag}-Downtown`);
  });

  it("rejects a duplicate or blank name, and deactivated people", async () => {
    const mk = (name: string, members: unknown[] = []) => {
      const f = new FormData();
      f.set("name", name);
      f.set("members", JSON.stringify(members));
      return createCafe({}, f);
    };
    expect((await run(() => mk(`${tag}-Downtown`))).result?.fieldErrors?.name).toMatch(/already exists/);
    expect((await run(() => mk("  "))).result?.fieldErrors?.name).toBeTruthy();
    const off = await prisma.user.create({ data: { firstName: `${tag}-off`, lastName: "Test", pin: nextPin(), active: false } });
    expect((await run(() => mk(`${tag}-Other`, [{ userId: off.id, role: "EMPLOYEE" }]))).result?.fieldErrors?.members).toMatch(/deactivated/);
    expect(await prisma.cafe.findUnique({ where: { name: `${tag}-Other` } })).toBeNull();
  });
});

describe("admins and employees can't manage people or cafes", () => {
  it("an admin is sent back to Admin; an employee to Inventory", async () => {
    await prisma.userCafe.update({ where: { userId_cafeId: { userId: ids.adminA, cafeId: ids.A } }, data: { role: Role.ADMIN } });
    await as(ids.adminA, ids.A);
    const cafeForm = () => {
      const f = new FormData();
      f.set("name", `${tag}-Sneaky`);
      f.set("members", "[]");
      return f;
    };
    expect((await run(() => actions.createEmployee({}, form({})))).redirect).toBe("/admin");
    expect((await run(() => actions.setEmployeeActive(ids.emp, false))).redirect).toBe("/admin");
    expect((await run(() => createCafe({}, cafeForm()))).redirect).toBe("/admin");
    await as(ids.emp, ids.A);
    expect((await run(() => actions.updateEmployee(ids.adminA, {}, form({})))).redirect).toBe("/inventory");
    expect((await run(() => createCafe({}, cafeForm()))).redirect).toBe("/inventory");
    expect(await prisma.cafe.findUnique({ where: { name: `${tag}-Sneaky` } })).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.emp } })).active).toBe(true);
    await as(ids.manager, ids.A);
  });
});
