"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/dal";
import { createSession, deleteSession } from "@/lib/auth/session";
import { checkRateLimit, clientIp, recordAttempt } from "@/lib/auth/rate-limit";
import { PIN_PATTERN } from "@/lib/auth/pin";

export type SignInState = { error?: string };

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const pin = String(formData.get("pin") ?? "");
  if (!PIN_PATTERN.test(pin)) return { error: "Enter your PIN" };

  const ip = clientIp(await headers());
  const limit = await checkRateLimit(ip);
  if (!limit.allowed) return { error: "Too many attempts. Try again in a few minutes." };

  const user = await prisma.user.findUnique({
    where: { pin },
    select: { id: true, active: true, cafes: { select: { cafeId: true } } },
  });
  const ok = !!user && user.active && user.cafes.length > 0;
  await recordAttempt(ip, ok);
  // Same message for unknown, inactive and unassigned users, so the response
  // never reveals whether a PIN belongs to someone.
  if (!ok) return { error: "PIN not recognized" };

  const cafeId = user.cafes.length === 1 ? user.cafes[0].cafeId : null;
  await createSession(user.id, cafeId);
  redirect(cafeId ? "/inventory" : "/select-cafe");
}

/** Pick or switch the active cafe. Only cafes the user belongs to are accepted. */
export async function selectCafe(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/");
  const cafeId = String(formData.get("cafeId") ?? "");
  if (!session.memberships.some((m) => m.cafeId === cafeId)) redirect("/select-cafe");
  await createSession(session.user.id, cafeId);
  redirect("/inventory");
}

export async function signOut(): Promise<void> {
  await deleteSession();
  redirect("/");
}
