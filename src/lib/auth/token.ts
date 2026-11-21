// Signing and verifying the session token. Pure (no Next.js request APIs) so
// it can be used from proxy.ts, server code, and tests.
//
// The token only says WHO is signed in and WHICH cafe they picked. It never
// carries a role: roles and active status are re-read from the database on
// every request (see dal.ts), so demotions and deactivations apply immediately.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "kaizen_session";
/** Sessions last 7 days and are renewed while the app is in use. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Re-issue the cookie (resetting the 7 days) once it's this old. */
export const SESSION_RENEW_AFTER_SECONDS = 24 * 60 * 60;

export type SessionClaims = {
  userId: string;
  /** null until the user picks a cafe. */
  cafeId: string | null;
  issuedAt: number; // seconds since epoch
  expiresAt: number; // seconds since epoch
};

function getKey(secret: string | undefined = process.env.SESSION_SECRET): Uint8Array {
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(
  data: { userId: string; cafeId: string | null },
  opts: { now?: number; secret?: string } = {},
): Promise<string> {
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  return new SignJWT({ cafe: data.cafeId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(data.userId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_TTL_SECONDS)
    .sign(getKey(opts.secret));
}

/** Returns the claims, or null if the token is missing, tampered with, or expired. */
export async function verifySession(
  token: string | undefined,
  opts: { now?: number; secret?: string } = {},
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey(opts.secret), {
      algorithms: ["HS256"],
      currentDate: opts.now === undefined ? undefined : new Date(opts.now),
    });
    if (typeof payload.sub !== "string" || !payload.iat || !payload.exp) return null;
    const cafe = payload.cafe;
    if (cafe !== null && typeof cafe !== "string") return null;
    return { userId: payload.sub, cafeId: cafe, issuedAt: payload.iat, expiresAt: payload.exp };
  } catch {
    return null;
  }
}

export function shouldRenew(claims: SessionClaims, now: number = Date.now()): boolean {
  return Math.floor(now / 1000) - claims.issuedAt >= SESSION_RENEW_AFTER_SECONDS;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
