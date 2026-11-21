"use server";

// Employee inventory submission.
//
// The client sends only what the employee entered. The server re-derives
// everything else: the item must belong to the employee's selected cafe and be
// active, today's min/max come from the rules for today's LA date, and the
// automatic order is recalculated here so it can't be faked.
import { refresh } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { toRule } from "@/lib/admin/data";
import { computeAutoOrder, parseOrder, parseQty } from "@/lib/order";
import { resolveQuantity } from "@/lib/quantity";
import { dateOnly, laDateString } from "@/lib/time";

export type SubmitState = {
  error?: string;
  /** Present after a successful submit. */
  submitted?: { at: string; counted: number };
};

const lineSchema = z.object({
  itemId: z.string().min(1).max(64),
  currentCount: z.string(),
  finalOrder: z.string(),
  manuallyEdited: z.boolean(),
  /** Marked "Plenty": obviously above the minimum, not counted, orders nothing. */
  plenty: z.boolean().optional().default(false),
});

export async function submitInventory(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  const session = await requireUser();
  const cafeId = session.current.cafeId;

  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get("lines") ?? "[]"));
  } catch {
    return { error: "Your counts couldn't be read. Please try again." };
  }
  const parsed = z.array(lineSchema).max(1000).safeParse(raw);
  if (!parsed.success) return { error: "Your counts couldn't be read. Please try again." };
  const input = parsed.data;
  if (input.length === 0) return { error: "Enter at least one count before submitting." };
  if (new Set(input.map((l) => l.itemId)).size !== input.length) {
    return { error: "An item was counted twice. Refresh and try again." };
  }

  // Only active items in active sections at the employee's own cafe.
  const items = await prisma.item.findMany({
    where: { id: { in: input.map((l) => l.itemId) }, active: true, section: { cafeId, active: true } },
    include: { rules: true },
  });
  if (items.length !== input.length) {
    return { error: "Some items changed since you started. Refresh the page and try again." };
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  const today = laDateString();

  const lines = [];
  for (const l of input) {
    const item = byId.get(l.itemId)!;
    if (l.plenty) {
      lines.push({ itemId: item.id, currentCount: null, autoOrder: 0, finalOrder: 0, manuallyEdited: false, wellStocked: true });
      continue;
    }
    const current = parseQty(l.currentCount);
    if (current === null) return { error: `Check the count for ${item.name}.` };
    const q = resolveQuantity(item.rules.map(toRule), today);
    if (!q) return { error: `${item.name} has no amounts set. Ask an admin.` };
    const autoOrder = computeAutoOrder(current, q.min, q.max);
    let finalOrder = autoOrder;
    if (l.manuallyEdited) {
      const edited = parseOrder(l.finalOrder);
      if (edited === null) return { error: `The order amount for ${item.name} must be a whole number.` };
      finalOrder = edited;
    }
    lines.push({
      itemId: item.id,
      currentCount: current,
      autoOrder,
      finalOrder,
      manuallyEdited: finalOrder !== autoOrder,
      wellStocked: false,
    });
  }

  const submission = await prisma.submission.create({
    data: {
      cafeId,
      userId: session.user.id,
      businessDate: dateOnly(today),
      lines: { createMany: { data: lines } },
    },
  });

  refresh();
  return { submitted: { at: submission.submittedAt.toISOString(), counted: lines.length } };
}
