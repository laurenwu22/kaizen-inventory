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
import { formatSlack, mergeDay } from "@/lib/combined";
import { dateOnly, laDateString } from "@/lib/time";

export type SubmitState = {
  error?: string;
  /** Present after a successful submit. `slack` covers just this submission. */
  submitted?: { at: string; counted: number; slack: string };
};

const addedSchema = z.object({
  sections: z.array(z.string().min(1).max(64)).max(200).default([]),
  items: z.array(z.string().min(1).max(64)).max(1000).default([]),
});

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

  // Sections/items this person added to today's count (shared once submitted).
  let added: { sections: string[]; items: string[] } = { sections: [], items: [] };
  try {
    const a = addedSchema.safeParse(JSON.parse(String(fd.get("added") ?? "{}")));
    if (a.success) added = a.data;
  } catch {}
  if (input.length === 0) return { error: "Enter at least one count before submitting." };
  if (new Set(input.map((l) => l.itemId)).size !== input.length) {
    return { error: "An item was counted twice. Refresh and try again." };
  }

  // Only active items in active sections at the employee's own cafe.
  const items = await prisma.item.findMany({
    where: { id: { in: input.map((l) => l.itemId) }, active: true, section: { cafeId, active: true } },
    include: { rules: true, section: { select: { id: true, name: true, sortOrder: true } } },
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

  // Only additions that belong to this cafe and are active are recorded.
  const [okSections, okItems] = await Promise.all([
    added.sections.length
      ? prisma.section.findMany({ where: { id: { in: added.sections }, cafeId, active: true }, select: { id: true } })
      : [],
    added.items.length
      ? prisma.item.findMany({
          where: { id: { in: added.items }, active: true, section: { cafeId, active: true } },
          select: { id: true },
        })
      : [],
  ]);
  const businessDate = dateOnly(today);
  const [submission] = await prisma.$transaction([
    prisma.submission.create({
      data: { cafeId, userId: session.user.id, businessDate, lines: { createMany: { data: lines } } },
    }),
    prisma.dayAddition.createMany({
      data: [
        ...okSections.map((s) => ({ cafeId, businessDate, sectionId: s.id, addedById: session.user.id })),
        ...okItems.map((i) => ({ cafeId, businessDate, itemId: i.id, addedById: session.user.id })),
      ],
      skipDuplicates: true, // someone else already added it today
    }),
  ]);

  refresh();
  // Slack text for only what was just submitted (items with something to order).
  const slack = formatSlack(
    today,
    mergeDay(
      [{ submittedAt: submission.submittedAt, submittedBy: session.user.fullName, lines: lines.map((l) => ({ itemId: l.itemId, finalOrder: l.finalOrder })) }],
      new Map(items.map((i) => [i.id, { name: i.name, unit: i.unit, sortOrder: i.sortOrder, section: i.section }])),
    ),
  );
  return { submitted: { at: submission.submittedAt.toISOString(), counted: lines.length, slack } };
}
