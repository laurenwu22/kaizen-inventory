import { describe, expect, it } from "vitest";
import { SESSION_TTL_SECONDS, shouldRenew, signSession, verifySession } from "@/lib/auth/token";

const secret = "test-secret-test-secret-test-secret-1234";
const other = "another-secret-another-secret-another-99";
const now = Date.UTC(2026, 10, 20, 18, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

describe("session token", () => {
  it("round-trips user and cafe", async () => {
    const t = await signSession({ userId: "u1", cafeId: "c1" }, { now, secret });
    const c = await verifySession(t, { now, secret });
    expect(c).toMatchObject({ userId: "u1", cafeId: "c1" });
    expect(c!.expiresAt - c!.issuedAt).toBe(SESSION_TTL_SECONDS);
  });

  it("supports no cafe selected", async () => {
    const t = await signSession({ userId: "u1", cafeId: null }, { now, secret });
    expect((await verifySession(t, { now, secret }))?.cafeId).toBeNull();
  });

  it("rejects missing, garbage, tampered and wrong-secret tokens", async () => {
    const t = await signSession({ userId: "u1", cafeId: "c1" }, { now, secret });
    const [h, p, s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "admin", cafe: "c1", iat: now / 1000, exp: now / 1000 + 999 })).toString("base64url");
    expect(await verifySession(undefined, { now, secret })).toBeNull();
    expect(await verifySession("not-a-token", { now, secret })).toBeNull();
    expect(await verifySession(`${h}.${forged}.${s}`, { now, secret })).toBeNull();
    expect(await verifySession(`${h}.${p}.${s.slice(0, -2)}xx`, { now, secret })).toBeNull();
    expect(await verifySession(t, { now, secret: other })).toBeNull();
  });

  it("expires after 7 days", async () => {
    const t = await signSession({ userId: "u1", cafeId: "c1" }, { now, secret });
    expect(await verifySession(t, { now: now + 7 * DAY - 60_000, secret })).not.toBeNull();
    expect(await verifySession(t, { now: now + 7 * DAY + 60_000, secret })).toBeNull();
  });

  it("renews once a day old", async () => {
    const t = await signSession({ userId: "u1", cafeId: "c1" }, { now, secret });
    const c = (await verifySession(t, { now, secret }))!;
    expect(shouldRenew(c, now + 23 * 60 * 60 * 1000)).toBe(false);
    expect(shouldRenew(c, now + DAY)).toBe(true);
  });

  it("refuses a short secret", async () => {
    await expect(signSession({ userId: "u1", cafeId: null }, { secret: "short" })).rejects.toThrow();
  });
});
