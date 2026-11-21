// Employee management actions against the real database (DATABASE_URL in .env).
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

// No "_" or "%" in the tag: Prisma startsWith uses SQL LIKE.
const tag = `test-emp-${Date.now()}`;
const ids = { A: "", B: "", C: "", adminA: "", adminB: "", emp: "", onlyC: "", qAdminC: "" };
let pinSeq = Math.floor(Math.random() * 900000) + 1000000;
const nextPin = () => String(pinSeq++);

type M = { cafeId: string; role: "EMPLOYEE" | "ADMIN" };
const form = (o: { firstName?: string; lastName?: string; pin?: string; memberships?: M[] | string }) => {
  const f = new FormData();
  f.set("firstName", o.firstName ?? `${tag}-new`);
  f.set("lastName", o.lastName ?? "Person");
  f.set("pin", o.pin ?? nextPin());
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

beforeAll(async () => {
  const [a, b, c] = await Promise.all(
    ["A", "B", "C"].map((n) => prisma.cafe.create({ data: { name: `${tag}-${n}` } })),
  );
  Object.assign(ids, { A: a.id, B: b.id, C: c.id });
  const mk = async (n: string, memberships: M[]) =>
    (
      await prisma.user.create({
        data: { firstName: `${tag}-${n}`, lastName: "Test", pin: nextPin(), cafes: { create: memberships } },
      })
    ).id;
  ids.adminA = await mk("adminA", [{ cafeId: a.id, role: Role.ADMIN }, { cafeId: b.id, role: Role.EMPLOYEE }]);
  ids.adminB = await mk("adminB", [{ cafeId: b.id, role: Role.ADMIN }]);
  ids.emp = await mk("emp", [{ cafeId: a.id, role: Role.EMPLOYEE }]);
  ids.onlyC = await mk("onlyC", [{ cafeId: c.id, role: Role.EMPLOYEE }]);
  // The only admin at C, who also works at A.
  ids.qAdminC = await mk("qAdminC", [{ cafeId: c.id, role: Role.ADMIN }, { cafeId: a.id, role: Role.EMPLOYEE }]);
  await as(ids.adminA, a.id);
});

afterAll(async () => {
  const cafeIds = [ids.A, ids.B, ids.C].filter(Boolean);
  await prisma.userCafe.deleteMany({ where: { cafeId: { in: cafeIds } } });
  await prisma.user.deleteMany({ where: { firstName: { startsWith: tag } } });
  await prisma.cafe.deleteMany({ where: { id: { in: cafeIds } } });
  await prisma.$disconnect();
});

describe("adding employees", () => {
  it("adds a person with a role at a cafe the admin manages", async () => {
    const pin = nextPin();
    const r = await run(() => actions.createEmployee({}, form({ firstName: `${tag}-maria`, pin, memberships: [{ cafeId: ids.A, role: "ADMIN" }] })));
    expect(r.result?.ok).toBe(true);
    const u = await prisma.user.findUniqueOrThrow({ where: { pin }, include: { cafes: true } });
    expect(u).toMatchObject({ firstName: `${tag}-maria`, lastName: "Person", active: true });
    expect(u.cafes.map((m) => [m.cafeId, m.role])).toEqual([[ids.A, "ADMIN"]]);
  });

  it("can't assign a cafe where the admin isn't an admin", async () => {
    const r = await run(() =>
      actions.createEmployee({}, form({ memberships: [{ cafeId: ids.A, role: "EMPLOYEE" }, { cafeId: ids.B, role: "EMPLOYEE" }] })),
    );
    expect(r.result?.fieldErrors?.memberships).toMatch(/where you're an admin/);
  });

  it("rejects a PIN that's already in use, bad PINs, blank names and no cafes", async () => {
    const taken = (await prisma.user.findUniqueOrThrow({ where: { id: ids.emp } })).pin;
    expect((await run(() => actions.createEmployee({}, form({ pin: taken })))).result?.fieldErrors?.pin).toMatch(/already in use/);
    for (const bad of ["12", "123456789", "12a4", ""]) {
      expect((await run(() => actions.createEmployee({}, form({ pin: bad })))).result?.fieldErrors?.pin, bad).toMatch(/3 to 8 digits/);
    }
    const blank = await run(() => actions.createEmployee({}, form({ firstName: " ", lastName: "" })));
    expect(blank.result?.fieldErrors).toMatchObject({ firstName: expect.any(String), lastName: expect.any(String) });
    expect((await run(() => actions.createEmployee({}, form({ memberships: [] })))).result?.fieldErrors?.memberships).toMatch(/at least one/);
    expect((await run(() => actions.createEmployee({}, form({ memberships: "nope" })))).result?.fieldErrors?.memberships).toBeTruthy();
  });

  it("accepts 3-digit PINs", async () => {
    let pin = "";
    for (let i = 100; i < 1000; i++) {
      if (!(await prisma.user.findUnique({ where: { pin: String(i) } }))) {
        pin = String(i);
        break;
      }
    }
    expect((await run(() => actions.createEmployee({}, form({ pin })))).result?.ok).toBe(true);
  });
});

describe("editing employees", () => {
  it("updates name, PIN and role", async () => {
    const pin = nextPin();
    const r = await run(() =>
      actions.updateEmployee(ids.emp, {}, form({ firstName: `${tag}-emp`, lastName: "Renamed", pin, memberships: [{ cafeId: ids.A, role: "ADMIN" }] })),
    );
    expect(r.redirect).toBe("/admin/employees");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: ids.emp } })).toMatchObject({ lastName: "Renamed", pin });
    expect(await roleAt(ids.emp, ids.A)).toBe("ADMIN");
    await run(() => actions.updateEmployee(ids.emp, {}, form({ firstName: `${tag}-emp`, memberships: [{ cafeId: ids.A, role: "EMPLOYEE" }] })));
    expect(await roleAt(ids.emp, ids.A)).toBe("EMPLOYEE");
  });

  it("leaves memberships at cafes the admin doesn't manage untouched", async () => {
    await prisma.userCafe.create({ data: { userId: ids.emp, cafeId: ids.B, role: Role.EMPLOYEE } });
    await run(() => actions.updateEmployee(ids.emp, {}, form({ firstName: `${tag}-emp`, memberships: [{ cafeId: ids.A, role: "EMPLOYEE" }] })));
    expect(await roleAt(ids.emp, ids.B)).toBe("EMPLOYEE");
    await prisma.userCafe.delete({ where: { userId_cafeId: { userId: ids.emp, cafeId: ids.B } } });
  });

  it("the last active admin can't be demoted or removed from the cafe", async () => {
    // A's admins right now: adminA and maria (created above). Demote maria first.
    const maria = await prisma.user.findFirstOrThrow({ where: { firstName: `${tag}-maria` } });
    await run(() => actions.updateEmployee(maria.id, {}, form({ firstName: maria.firstName, pin: maria.pin, memberships: [{ cafeId: ids.A, role: "EMPLOYEE" }] })));
    const adminA = await prisma.user.findUniqueOrThrow({ where: { id: ids.adminA } });
    const demote = await run(() =>
      actions.updateEmployee(ids.adminA, {}, form({ firstName: adminA.firstName, pin: adminA.pin, memberships: [{ cafeId: ids.A, role: "EMPLOYEE" }] })),
    );
    expect(demote.result?.error).toMatch(new RegExp(`${tag}-A needs at least one active admin`));
    const remove = await run(() => actions.updateEmployee(ids.adminA, {}, form({ firstName: adminA.firstName, pin: adminA.pin, memberships: [] })));
    expect(remove.result?.error).toMatch(/needs at least one active admin/);
    expect(await roleAt(ids.adminA, ids.A)).toBe("ADMIN");
  });

  it("can't edit someone who doesn't work at the admin's cafe", async () => {
    expect((await run(() => actions.updateEmployee(ids.onlyC, {}, form({}))))).toMatchObject({ notFound: true });
    expect((await run(() => actions.setEmployeeActive(ids.onlyC, false)))).toMatchObject({ notFound: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.onlyC } })).active).toBe(true);
  });
});

describe("deactivating", () => {
  it("deactivates and reactivates; a deactivated person's session stops working", async () => {
    expect((await run(() => actions.setEmployeeActive(ids.emp, false))).redirect).toBe("/admin/employees");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.emp } })).active).toBe(false);
    const claims = { userId: ids.emp, cafeId: ids.A, issuedAt: 0, expiresAt: 0 };
    expect(await loadSession(claims)).toBeNull();
    await run(() => actions.setEmployeeActive(ids.emp, true));
    expect(await loadSession(claims)).not.toBeNull();
  });

  it("can't deactivate the last active admin at the admin's own cafe", async () => {
    const r = await run(() => actions.setEmployeeActive(ids.adminA, false));
    expect(r.result?.error).toMatch(/needs at least one active admin/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.adminA } })).active).toBe(true);
  });

  it("can't deactivate someone who is the last admin at another of their cafes", async () => {
    const r = await run(() => actions.setEmployeeActive(ids.qAdminC, false));
    expect(r.result?.error).toMatch(new RegExp(`${tag}-C needs at least one active admin`));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.qAdminC } })).active).toBe(true);
  });
});

describe("non-admins", () => {
  it("an employee can't manage people", async () => {
    await as(ids.emp, ids.A);
    expect((await run(() => actions.createEmployee({}, form({})))).redirect).toBe("/inventory");
    expect((await run(() => actions.updateEmployee(ids.adminA, {}, form({}))))).toMatchObject({ redirect: "/inventory" });
    expect((await run(() => actions.setEmployeeActive(ids.adminA, false))).redirect).toBe("/inventory");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.adminA } })).active).toBe(true);
    await as(ids.adminA, ids.A);
  });
});
