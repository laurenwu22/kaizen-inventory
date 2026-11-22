"use server";

// Employee management Server Actions (managers only).
//
// - requireManager() on every action. Managers are organization-wide: they can
//   manage anyone and assign any cafe.
// - There must always be at least one active manager. That's checked inside
//   the same serializable transaction as the change, so concurrent edits
//   can't both slip past it.
import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth/dal";
import { LastManagerError, parseEmployeeForm } from "@/lib/admin/employees";
import { assertActiveManager } from "@/lib/admin/managers";
import { saved, type FormState } from "@/lib/admin/validation";
import { Prisma } from "@/generated/prisma/client";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "");

async function allCafeIds(): Promise<Set<string>> {
  return new Set((await prisma.cafe.findMany({ select: { id: true } })).map((c) => c.id));
}

async function getUserOr404(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { cafes: true } });
  if (!user) notFound();
  return user;
}


/** Maps known errors to form messages; rethrows anything else. */
function toFormError(e: unknown): FormState {
  if (e instanceof LastManagerError) return { error: `${e.message} Make someone else a manager first.` };
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
    isManager: str(fd, "isManager"),
  };
}

export async function createEmployee(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireManager();
  const parsed = parseEmployeeForm(formFields(fd), await allCafeIds());
  if (!parsed.data) return parsed.state;
  const { firstName, lastName, pin, isManager, memberships } = parsed.data;
  try {
    await prisma.user.create({
      data: {
        firstName,
        lastName,
        pin,
        isManager,
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
  await requireManager();
  const user = await getUserOr404(userId);
  const parsed = parseEmployeeForm(formFields(fd), await allCafeIds());
  if (!parsed.data) return parsed.state;
  const { firstName, lastName, pin, isManager, memberships } = parsed.data;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { firstName, lastName, pin, isManager } });
      await tx.userCafe.deleteMany({
        where: { userId: user.id, cafeId: { notIn: memberships.map((m) => m.cafeId) } },
      });
      for (const m of memberships) {
        await tx.userCafe.upsert({
          where: { userId_cafeId: { userId: user.id, cafeId: m.cafeId } },
          update: { role: m.role },
          create: { userId: user.id, cafeId: m.cafeId, role: m.role },
        });
      }
      await assertActiveManager(tx);
    }, serializable);
  } catch (e) {
    return toFormError(e);
  }
  redirect("/admin/employees");
}

export async function setEmployeeActive(userId: string, active: boolean): Promise<FormState> {
  const session = await requireManager();
  const user = await getUserOr404(userId);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { active } });
      if (!active) await assertActiveManager(tx);
    }, serializable);
  } catch (e) {
    return toFormError(e);
  }
  if (!active && user.id === session.user.id) redirect("/"); // deactivated yourself
  redirect("/admin/employees");
}
