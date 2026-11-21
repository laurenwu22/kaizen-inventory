// Sign-in Server Actions against the real database (DATABASE_URL in .env).
// Next.js request APIs (cookies, headers, redirect) are replaced with fakes.
import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, { value: string; options?: Record<string, unknown> }>();
let ip = "";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => jar.set(name, { value, options }),
    delete: (name: string) => jar.delete(name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": ip }),
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
}));

const { prisma } = await import("@/lib/db");
const { Role } = await import("@/generated/prisma/client");
const { signIn, selectCafe, signOut } = await import("@/app/actions/auth");
const { SESSION_COOKIE, SESSION_TTL_SECONDS, verifySession } = await import("@/lib/auth/token");

// No "_" or "%": Prisma startsWith uses SQL LIKE, where those are wildcards.
const tag = `test-signin-${Date.now()}`;
let cafeA: { id: string }, cafeB: { id: string }, cafeC: { id: string };
let pin3 = "", pin4 = "", pinInactive = "";
let oneCafeUserId = "";

async function attempt(pin: string) {
  const fd = new FormData();
  fd.set("pin", pin);
  try {
    return { result: await signIn({}, fd), redirect: null as string | null };
  } catch (e) {
    if (e instanceof Redirect) return { result: null, redirect: e.to };
    throw e;
  }
}
async function act(fn: () => Promise<void>) {
  try {
    await fn();
    return null;
  } catch (e) {
    if (e instanceof Redirect) return e.to;
    throw e;
  }
}
const sessionClaims = () => verifySession(jar.get(SESSION_COOKIE)?.value);

beforeAll(async () => {
  const taken = new Set((await prisma.user.findMany({ select: { pin: true } })).map((u) => u.pin));
  const free = (from: number, to: number, skip: string[] = []) => {
    for (let i = from; i < to; i++) if (!taken.has(String(i)) && !skip.includes(String(i))) return String(i);
    throw new Error("no free test PIN");
  };
  pin3 = free(100, 1000);
  pin4 = free(9000, 10000);
  pinInactive = free(9000, 10000, [pin4]);

  [cafeA, cafeB, cafeC] = await Promise.all(
    ["A", "B", "C"].map((n) => prisma.cafe.create({ data: { name: `${tag}_${n}` } })),
  );
  const one = await prisma.user.create({
    data: { firstName: `${tag}_one`, lastName: "Test", pin: pin3, cafes: { create: { cafeId: cafeA.id, role: Role.EMPLOYEE } } },
  });
  oneCafeUserId = one.id;
  await prisma.user.create({
    data: { firstName: `${tag}_two`, lastName: "Test", pin: pin4, cafes: { create: [{ cafeId: cafeA.id }, { cafeId: cafeB.id }] } },
  });
  await prisma.user.create({
    data: { firstName: `${tag}_off`, lastName: "Test", pin: pinInactive, active: false, cafes: { create: { cafeId: cafeA.id } } },
  });
});

afterAll(async () => {
  await prisma.loginAttempt.deleteMany({ where: { ip: { startsWith: tag } } });
  const cafeIds = [cafeA, cafeB, cafeC].filter(Boolean).map((c) => c.id);
  await prisma.userCafe.deleteMany({ where: { cafeId: { in: cafeIds } } });
  await prisma.user.deleteMany({ where: { firstName: { startsWith: tag } } });
  await prisma.cafe.deleteMany({ where: { id: { in: cafeIds } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  jar.clear();
  ip = `${tag}-${Math.random()}`;
});

describe("signIn", () => {
  it("3-digit PIN with one cafe goes straight to inventory", async () => {
    const r = await attempt(pin3);
    expect(r.redirect).toBe("/inventory");
    expect(await sessionClaims()).toMatchObject({ userId: oneCafeUserId, cafeId: cafeA.id });
    const opts = jar.get(SESSION_COOKIE)!.options!;
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS });
  });

  it("4-digit PIN with two cafes goes to the location picker", async () => {
    const r = await attempt(pin4);
    expect(r.redirect).toBe("/select-cafe");
    expect((await sessionClaims())?.cafeId).toBeNull();
  });

  it("wrong PIN and inactive user get the same message and no cookie", async () => {
    expect((await attempt("000")).result).toEqual({ error: "PIN not recognized" });
    expect((await attempt(pinInactive)).result).toEqual({ error: "PIN not recognized" });
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("rejects malformed PINs without touching the database", async () => {
    for (const bad of ["", "12", "123456789", "12a4"]) {
      expect((await attempt(bad)).result).toEqual({ error: "Enter your PIN" });
    }
    expect(await prisma.loginAttempt.count({ where: { ip } })).toBe(0);
  });

  it("blocks an IP after 5 wrong PINs, even with the right PIN", async () => {
    for (let i = 0; i < 5; i++) await attempt("000");
    const r = await attempt(pin3);
    expect(r.result).toEqual({ error: "Too many attempts. Try again in a few minutes." });
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });
});

describe("selectCafe and signOut", () => {
  it("switches to a cafe the user belongs to", async () => {
    await attempt(pin4);
    const fd = new FormData();
    fd.set("cafeId", cafeB.id);
    expect(await act(() => selectCafe(fd))).toBe("/inventory");
    expect((await sessionClaims())?.cafeId).toBe(cafeB.id);
  });

  it("refuses a cafe the user doesn't belong to", async () => {
    await attempt(pin4);
    const fd = new FormData();
    fd.set("cafeId", cafeC.id);
    expect(await act(() => selectCafe(fd))).toBe("/select-cafe");
    expect((await sessionClaims())?.cafeId).toBeNull();
  });

  it("refuses to pick a cafe when signed out", async () => {
    const fd = new FormData();
    fd.set("cafeId", cafeA.id);
    expect(await act(() => selectCafe(fd))).toBe("/");
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("sign out clears the cookie", async () => {
    await attempt(pin3);
    expect(await act(signOut)).toBe("/");
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });
});
