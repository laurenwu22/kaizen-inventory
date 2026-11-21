"use server";

// Employee management Server Actions.
//
// - requireAdmin() for the selected cafe on every action.
// - An admin manages people who belong to the selected cafe, and can only add
//   or change memberships at cafes where they themselves are an admin.
// - Any admin of the selected cafe can deactivate/reactivate a member of it.
// - No cafe may be left without an active admin. That's checked inside the
//   same serializable transaction as the change, so concurrent edits can't
//   both slip past it.
import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin, type ActiveSession } from "@/lib/auth/dal";
import { LastAdminError, parseEmployeeForm } from "@/lib/admin/employees";
import { saved, type FormState } from "@/lib/admin/validation";
import { Prisma, Role } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "");

function managedCafeIds(session: ActiveSession): Set<string> {
  return new Set(session.memberships.filter((m) => m.role === Role.ADMIN).map((m) => m.cafeId));
}

/** The person, if they belong to the admin's selected cafe; otherwise 404. */
async function getManagedUser(session: ActiveSession, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, cafes: { some: { cafeId: session.current.cafeId } } },
    include: { cafes: true },
  });
  if (!user) notFound();
  return user;
}

/** Throws LastAdminError if any of these cafes has no active admin. */
async function assertActiveAdmins(tx: Tx, cafeIds: string[]) {
  for (const cafeId of new Set(cafeIds)) {
    const admins = await tx.userCafe.count({ where: { cafeId, role: Role.ADMIN, user: { active: true } } });
    if (admins === 0) {
      const cafe = await tx.cafe.findUniqueOrThrow({ where: { id: cafeId }, select: { name: true } });
      throw new LastAdminError(cafe.name);
    }
  }
}

/** Maps known errors to form messages; rethrows anything else. */
function toFormError(e: unknown): FormState {
  if (e instanceof LastAdminError) return { error: `${e.message} Make someone else an admin there first.` };
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return { fieldErrors: { pin: "That PIN is already in use. Each person needs their own." } };
    if (e.code === "P2034") return { error: "Someone else changed this at the same time. Please try again." };
  }
  throw e;
}

const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

function formFields(fd: FormData) {
  return {
    firstName: str(fd, "firstName"),
    lastName: str(fd, "lastName"),
    pin: str(fd, "pin"),
    memberships: str(fd, "memberships"),
  };
}

export async function createEmployee(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = parseEmployeeForm(formFields(fd), managedCafeIds(session), { requireAtLeastOne: true });
  if (!parsed.data) return parsed.state;
  const { firstName, lastName, pin, memberships } = parsed.data;
  try {
    await prisma.user.create({
      data: {
        firstName,
        lastName,
        pin,
        cafes: { create: memberships.map((m) => ({ cafeId: m.cafeId, role: m.role })) },
      },
    });
  } catch (e) {
    return toFormError(e);
  }
  refresh();
  return saved();
}

export async function updateEmployee(userId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const user = await getManagedUser(session, userId);
  const managed = managedCafeIds(session);
  const parsed = parseEmployeeForm(formFields(fd), managed, { requireAtLeastOne: false });
  if (!parsed.data) return parsed.state;
  const { firstName, lastName, pin, memberships } = parsed.data;
  const wanted = new Map(memberships.map((m) => [m.cafeId, m.role]));
  const otherCafes = user.cafes.filter((m) => !managed.has(m.cafeId));
  if (wanted.size === 0 && otherCafes.length === 0) {
    return { fieldErrors: { memberships: "Pick at least one cafe, or deactivate this person instead." } };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { firstName, lastName, pin } });
      // Only cafes this admin manages change; other memberships are left alone.
      for (const cafeId of managed) {
        const role = wanted.get(cafeId);
        if (role) {
          await tx.userCafe.upsert({
            where: { userId_cafeId: { userId: user.id, cafeId } },
            update: { role },
            create: { userId: user.id, cafeId, role },
          });
        } else {
          await tx.userCafe.deleteMany({ where: { userId: user.id, cafeId } });
        }
      }
      await assertActiveAdmins(tx, [...managed]);
    }, serializable);
  } catch (e) {
    return toFormError(e);
  }
  redirect("/admin/employees");
}

export async function setEmployeeActive(userId: string, active: boolean): Promise<FormState> {
  const session = await requireAdmin();
  const user = await getManagedUser(session, userId);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { active } });
      // Deactivating must not leave any of their cafes without an active admin.
      if (!active) await assertActiveAdmins(tx, user.cafes.map((m) => m.cafeId));
    }, serializable);
  } catch (e) {
    return toFormError(e);
  }
  if (!active && user.id === session.user.id) redirect("/"); // deactivated yourself
  redirect("/admin/employees");
}
