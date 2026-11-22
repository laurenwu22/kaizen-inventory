"use server";

// Cafe management (managers only).
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth/dal";
import { saved, type FormState } from "@/lib/admin/validation";
import { Prisma } from "@/generated/prisma/client";

const nameSchema = z.string().trim().min(1, "Cafe name is required").max(60, "Cafe name must be 60 characters or fewer");
const membersSchema = z.array(z.object({ userId: z.string().min(1).max(64), role: z.enum(["EMPLOYEE", "ADMIN"]) })).max(500);

/** Creates a cafe and assigns the chosen people to it. */
export async function createCafe(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireManager();
  const name = nameSchema.safeParse(String(fd.get("name") ?? ""));
  if (!name.success) return { fieldErrors: { name: name.error.issues[0].message } };

  let members: z.infer<typeof membersSchema> = [];
  try {
    const m = membersSchema.safeParse(JSON.parse(String(fd.get("members") ?? "[]")));
    if (!m.success) return { fieldErrors: { members: "The people list couldn't be read. Try again." } };
    members = m.data;
  } catch {
    return { fieldErrors: { members: "The people list couldn't be read. Try again." } };
  }
  if (new Set(members.map((m) => m.userId)).size !== members.length) {
    return { fieldErrors: { members: "Someone is listed twice." } };
  }
  const found = await prisma.user.count({ where: { id: { in: members.map((m) => m.userId) }, active: true } });
  if (found !== members.length) return { fieldErrors: { members: "Someone on the list was deactivated. Refresh and try again." } };

  try {
    await prisma.cafe.create({
      data: {
        name: name.data,
        members: { create: members.map((m) => ({ userId: m.userId, role: m.role })) },
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { fieldErrors: { name: "A cafe with this name already exists." } };
    }
    throw e;
  }
  refresh();
  return saved();
}

/**
 * Permanently deletes a cafe with everything in it: sections, items, quantity
 * rules, past submissions and who works there. People keep their accounts.
 * The last cafe can't be deleted (nobody could sign in to anything).
 */
export async function deleteCafe(cafeId: string): Promise<FormState> {
  const session = await requireManager();
  const cafe = await prisma.cafe.findUnique({ where: { id: cafeId }, select: { id: true } });
  if (!cafe) {
    refresh();
    return saved();
  }
  if ((await prisma.cafe.count()) <= 1) return { error: "This is the only cafe, so it can't be deleted." };

  const inCafe = { section: { cafeId } };
  await prisma.$transaction([
    prisma.submissionLine.deleteMany({ where: { submission: { cafeId } } }),
    prisma.submission.deleteMany({ where: { cafeId } }),
    prisma.dayAddition.deleteMany({ where: { cafeId } }),
    prisma.quantityRule.deleteMany({ where: { item: inCafe } }),
    prisma.item.deleteMany({ where: inCafe }),
    prisma.sectionExtraDate.deleteMany({ where: inCafe }),
    prisma.section.deleteMany({ where: { cafeId } }),
    prisma.userCafe.deleteMany({ where: { cafeId } }),
    prisma.cafe.delete({ where: { id: cafeId } }),
  ]);
  // Deleted the cafe you were in: pick another.
  if (session.current.cafeId === cafeId) redirect("/select-cafe");
  refresh();
  return saved();
}
