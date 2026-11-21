// Reading and writing the session cookie. Writes only work in Server Actions,
// Route Handlers and proxy.ts (not while rendering a page).
import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionCookieOptions, signSession, verifySession } from "./token";

export async function createSession(userId: string, cafeId: string | null) {
  const token = await signSession({ userId, cafeId });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
}

export async function readSessionClaims() {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
