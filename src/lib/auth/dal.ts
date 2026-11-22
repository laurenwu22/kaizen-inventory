// Data access layer for authentication and authorization.
//
// EVERY page and Server Action that touches cafe data must go through
// requireUser() or requireAdmin(). Hiding buttons in the UI is not security.
// The cafe always comes from the session (validated against memberships here),
// never from a URL or form field.
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Role } from "@/generated/prisma/client";
import { readSessionClaims } from "./session";
import type { SessionClaims } from "./token";

export type Membership = { cafeId: string; cafeName: string; role: Role };

export type Session = {
  user: { id: string; firstName: string; lastName: string; fullName: string; isManager: boolean };
  /** All cafes the user belongs to, sorted by name. */
  memberships: Membership[];
  /** The selected cafe, or null if none is selected (or it's no longer valid). */
  current: Membership | null;
};

export type ActiveSession = Session & { current: Membership };

/**
 * Turns verified token claims into a session by checking the database:
 * the user must exist and be active, and the selected cafe must still be one
 * of their memberships. Returns null if the user can't be signed in.
 */
export async function loadSession(claims: SessionClaims | null): Promise<Session | null> {
  if (!claims) return null;
  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      active: true,
      isManager: true,
      cafes: { select: { role: true, cafe: { select: { id: true, name: true } } } },
    },
  });
  if (!user || !user.active) return null;

  // Managers are organization-wide: they can open every cafe, as an admin.
  const memberships = (
    user.isManager
      ? (await prisma.cafe.findMany({ select: { id: true, name: true } })).map((c) => ({
          cafeId: c.id,
          cafeName: c.name,
          role: Role.ADMIN,
        }))
      : user.cafes.map((m) => ({ cafeId: m.cafe.id, cafeName: m.cafe.name, role: m.role }))
  ).sort((a, b) => a.cafeName.localeCompare(b.cafeName));
  const current = memberships.find((m) => m.cafeId === claims.cafeId) ?? null;
  return {
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      isManager: user.isManager,
    },
    memberships,
    current,
  };
}

/** The current session, or null. Cached per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  return loadSession(await readSessionClaims());
});

export function isAdmin(session: Session | null): boolean {
  return session?.current?.role === Role.ADMIN;
}

/** Signed in with a valid cafe selected, or redirects. */
export async function requireUser(): Promise<ActiveSession> {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.current) redirect("/select-cafe");
  return session as ActiveSession;
}

/** Admin at the currently selected cafe (managers count), or redirects to the employee view. */
export async function requireAdmin(): Promise<ActiveSession> {
  const session = await requireUser();
  if (!isAdmin(session)) redirect("/inventory");
  return session;
}

export function isManager(session: Session | null): boolean {
  return !!session?.user.isManager;
}

/** A manager (organization-wide), or redirects: admins to Admin, others to Inventory. */
export async function requireManager(): Promise<ActiveSession> {
  const session = await requireUser();
  if (!isManager(session)) redirect(isAdmin(session) ? "/admin" : "/inventory");
  return session;
}
