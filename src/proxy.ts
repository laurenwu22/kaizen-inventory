// Runs before every page request. Two jobs:
// 1. Optimistic redirect: protected pages without a validly signed session
//    cookie go to the PIN pad. (Not the real security check; every page and
//    Server Action also calls requireUser()/requireAdmin(), which check the DB.)
// 2. Rolling sessions: once a day, re-issue the cookie so active users stay
//    signed in for 7 days from their last visit.
import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  shouldRenew,
  signSession,
  verifySession,
} from "@/lib/auth/token";

const PROTECTED_PREFIXES = ["/inventory", "/admin", "/select-cafe", "/order"];

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const claims = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isProtected && !claims) {
    const res = NextResponse.redirect(new URL("/", req.nextUrl));
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  const res = NextResponse.next();
  if (claims && shouldRenew(claims)) {
    const token = await signSession({ userId: claims.userId, cafeId: claims.cafeId });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
