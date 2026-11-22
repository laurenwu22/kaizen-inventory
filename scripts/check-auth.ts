// End-to-end authorization checks against a running app.
//
//   npm run dev            (in another terminal)
//   npm run test:auth      (BASE_URL defaults to http://localhost:3000)
//
// Creates throwaway cafes/users, sends real HTTP requests with signed session
// cookies, checks the server's responses, then deletes everything it created.
// Also exercises the PIN rate limiter against the database.
import "dotenv/config";
import { prisma } from "@/lib/db";
import { Role } from "@/generated/prisma/client";
import { SESSION_COOKIE, signSession } from "@/lib/auth/token";
import { LIMITS, checkRateLimit, recordAttempt } from "@/lib/auth/rate-limit";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const tag = `__auth_${Date.now()}`;
let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${pass || !detail ? "" : `  (${detail})`}`);
}

/** Where the server sent us: a 3xx Location, or a redirect streamed into the page. */
async function visit(path: string, token?: string) {
  const res = await fetch(BASE + path, {
    redirect: "manual",
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
  });
  const body = res.status >= 300 && res.status < 400 ? "" : await res.text();
  let redirectTo: string | null = null;
  if (res.status >= 300 && res.status < 400) {
    redirectTo = new URL(res.headers.get("location")!, BASE).pathname;
  } else {
    const m =
      body.match(/http-equiv="refresh" content="\d+;url=([^"]+)"/) ??
      body.match(/NEXT_REDIRECT;[a-z]+;([^;]+);/);
    if (m) redirectTo = new URL(m[1].replace(/&amp;/g, "&"), BASE).pathname;
  }
  return { status: res.status, body, redirectTo, setCookie: res.headers.get("set-cookie") ?? "" };
}

async function main() {
  const [cafeA, cafeB] = await Promise.all([
    prisma.cafe.create({ data: { name: `${tag}_A` } }),
    prisma.cafe.create({ data: { name: `${tag}_B` } }),
  ]);
  const mkUser = (name: string, pin: string, active = true) =>
    prisma.user.create({ data: { firstName: `${tag}_${name}`, lastName: "Test", pin, active } });
  const base = String(Date.now()).slice(-6);
  const [employee, admin, inactive] = await Promise.all([
    mkUser("employee", `9${base}1`),
    mkUser("admin", `9${base}2`),
    mkUser("inactive", `9${base}3`, false),
  ]);
  await prisma.userCafe.createMany({
    data: [
      { userId: employee.id, cafeId: cafeA.id, role: Role.EMPLOYEE },
      { userId: admin.id, cafeId: cafeA.id, role: Role.ADMIN },
      { userId: admin.id, cafeId: cafeB.id, role: Role.EMPLOYEE },
      { userId: inactive.id, cafeId: cafeA.id, role: Role.ADMIN },
    ],
  });
  const testIp = `${tag}_ip`;

  try {
    const tok = (userId: string, cafeId: string | null, now?: number) =>
      signSession({ userId, cafeId }, { now });
    const DAY = 24 * 60 * 60 * 1000;

    // Signed out
    let r = await visit("/inventory");
    check("signed out: /inventory -> /", r.redirectTo === "/", `got ${r.status} ${r.redirectTo}`);
    r = await visit("/print");
    check("signed out: /print -> /", r.redirectTo === "/", `got ${r.status} ${r.redirectTo}`);
    r = await visit("/admin");
    check("signed out: /admin -> /", r.redirectTo === "/", `got ${r.status} ${r.redirectTo}`);
    r = await visit("/");
    check("signed out: / shows PIN pad", r.status === 200 && r.body.includes("Enter your Toast PIN"));

    // Bad tokens
    const good = await tok(employee.id, cafeA.id);
    r = await visit("/inventory", good.slice(0, -3) + "abc");
    check("tampered cookie -> /", r.redirectTo === "/", `got ${r.status} ${r.redirectTo}`);
    r = await visit("/inventory", await tok(employee.id, cafeA.id, Date.now() - 8 * DAY));
    check("expired cookie (8 days) -> /", r.redirectTo === "/", `got ${r.status} ${r.redirectTo}`);

    // Employee
    r = await visit("/inventory", good);
    check("employee: /inventory renders", r.status === 200 && !r.redirectTo && r.body.includes("Welcome back"), `got ${r.status} ${r.redirectTo}`);
    check("employee: no Admin tab", !r.body.includes('href="/admin"'));
    r = await visit("/print", good);
    check("employee: /print renders the count sheet", r.status === 200 && !r.redirectTo && r.body.includes("Counted by"), `got ${r.status} ${r.redirectTo}`);
    r = await visit("/admin", good);
    check("employee: /admin refused -> /inventory", r.redirectTo === "/inventory" && !r.body.includes("+ Add section"), `got ${r.status} ${r.redirectTo}`);
    r = await visit("/", good);
    check("employee: / -> /inventory when signed in", r.redirectTo === "/inventory", `got ${r.status} ${r.redirectTo}`);

    // Cafe not belonged to
    r = await visit("/inventory", await tok(employee.id, cafeB.id));
    check("employee with other cafe in cookie -> /select-cafe", r.redirectTo === "/select-cafe", `got ${r.status} ${r.redirectTo}`);

    // Admin is per cafe
    r = await visit("/admin", await tok(admin.id, cafeA.id));
    check("admin at A: /admin renders", r.status === 200 && !r.redirectTo && r.body.includes("+ Add section"), `got ${r.status} ${r.redirectTo}`);
    r = await visit("/inventory", await tok(admin.id, cafeA.id));
    check("admin at A: Admin tab shown", r.body.includes('href="/admin"'));
    r = await visit("/admin", await tok(admin.id, cafeB.id));
    check("admin at A but employee at B: /admin at B refused", r.redirectTo === "/inventory" && !r.body.includes("+ Add section"), `got ${r.status} ${r.redirectTo}`);
    r = await visit("/select-cafe", await tok(admin.id, null));
    check("multi-cafe user: /select-cafe lists both cafes", r.body.includes(cafeA.name) && r.body.includes(cafeB.name));

    // Admin sub-pages
    const sectionA = await prisma.section.create({ data: { cafeId: cafeA.id, name: "Check A" } });
    const sectionB = await prisma.section.create({ data: { cafeId: cafeB.id, name: "Check B" } });
    r = await visit("/admin/sections/new", good);
    check("employee: /admin/sections/new refused", r.redirectTo === "/inventory", `got ${r.status} ${r.redirectTo}`);
    r = await visit(`/admin/sections/${sectionA.id}`, good);
    check("employee: section page refused", r.redirectTo === "/inventory" && !r.body.includes("Check A"), `got ${r.status} ${r.redirectTo}`);
    r = await visit(`/admin/sections/${sectionA.id}`, await tok(admin.id, cafeA.id));
    check("admin at A: own section page renders", r.status === 200 && r.body.includes("Check A"), `got ${r.status} ${r.redirectTo}`);
    r = await visit(`/admin/sections/${sectionB.id}`, await tok(admin.id, cafeA.id));
    check("admin at A: cafe B's section page is not found", !r.body.includes("Check B") && (r.status === 404 || r.body.includes("NEXT_HTTP_ERROR_FALLBACK;404") || r.body.includes("could not be found")), `got ${r.status}`);

    // Employees and Cafes are for managers only
    for (const path of ["/admin/employees", "/admin/cafes", "/backup"]) {
      r = await visit(path, await tok(admin.id, cafeA.id));
      check(`admin (not manager): ${path} -> /admin`, r.redirectTo === "/admin", `got ${r.status} ${r.redirectTo}`);
      r = await visit(path, good);
      check(`employee: ${path} -> /inventory`, r.redirectTo === "/inventory", `got ${r.status} ${r.redirectTo}`);
    }
    r = await visit("/admin", await tok(admin.id, cafeA.id));
    check("admin (not manager): no Employees/Cafes tabs or Backup menu item", !r.body.includes('href="/admin/employees"') && !r.body.includes('href="/admin/cafes"') && !r.body.includes('href="/backup"'));

    // Deactivation and demotion apply immediately to existing sessions
    r = await visit("/inventory", await tok(inactive.id, cafeA.id));
    check("deactivated user's session -> /", r.redirectTo === "/", `got ${r.status} ${r.redirectTo}`);
    await prisma.userCafe.update({
      where: { userId_cafeId: { userId: admin.id, cafeId: cafeA.id } },
      data: { role: Role.EMPLOYEE },
    });
    r = await visit("/admin", await tok(admin.id, cafeA.id));
    check("demoted admin's existing session: /admin refused", r.redirectTo === "/inventory", `got ${r.status} ${r.redirectTo}`);

    // Rolling renewal
    r = await visit("/inventory", await tok(employee.id, cafeA.id, Date.now() - 2 * DAY));
    check("2-day-old session gets a renewed cookie", r.setCookie.includes(`${SESSION_COOKIE}=`));
    r = await visit("/inventory", good);
    check("fresh session isn't re-issued", !r.setCookie.includes(`${SESSION_COOKIE}=`));

    // Rate limiter
    check("rate limit: new IP allowed", (await checkRateLimit(testIp)).allowed);
    for (let i = 0; i < LIMITS.ipMaxFailures; i++) await recordAttempt(testIp, false);
    const blocked = await checkRateLimit(testIp);
    check("rate limit: blocked after 5 failures", !blocked.allowed && blocked.reason === "ip");
    const later = new Date(Date.now() + LIMITS.ipWindowMs + 1000);
    check("rate limit: allowed again after 10 minutes", (await checkRateLimit(testIp, later)).allowed);
    await recordAttempt(testIp, true);
    check("rate limit: success resets the IP's failures", (await checkRateLimit(testIp)).allowed);
  } finally {
    await prisma.loginAttempt.deleteMany({ where: { ip: testIp } });
    await prisma.section.deleteMany({ where: { cafeId: { in: [cafeA.id, cafeB.id] } } });
    await prisma.userCafe.deleteMany({ where: { cafeId: { in: [cafeA.id, cafeB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [employee.id, admin.id, inactive.id] } } });
    await prisma.cafe.deleteMany({ where: { id: { in: [cafeA.id, cafeB.id] } } });
  }

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exitCode = failures ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
