// Combined order for one cafe and one day: all of that day's submissions merged
// into one list. Pure, so it's unit tested and shared by the combined order
// page, the inventory screen's Copy for Slack, and (later) order history.
//
// SPEC: if two people counted the same item, the latest count wins. Only items
// with a to-order amount above 0 are included.
import { byPosition } from "./quantity";
import { formatQty } from "./quantity";
import { dateOnly } from "./time";

export type ItemInfo = {
  name: string;
  unit: string;
  sortOrder: number;
  section: { id: string; name: string; sortOrder: number };
};

export type DaySubmission = {
  submittedAt: Date;
  submittedBy: string; // first name
  lines: { itemId: string; finalOrder: number }[];
};

export type CombinedLine = { itemId: string; name: string; unit: string; order: number; countedBy: string; countedAt: Date };
export type CombinedSection = { id: string; name: string; lines: CombinedLine[] };
export type CombinedOrder = {
  submissions: { by: string; at: Date }[];
  sections: CombinedSection[];
};

export function mergeDay(submissions: DaySubmission[], items: ReadonlyMap<string, ItemInfo>): CombinedOrder {
  const chronological = [...submissions].sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());

  // Latest count per item: later submissions overwrite earlier ones.
  const latest = new Map<string, { order: number; by: string; at: Date }>();
  for (const s of chronological) {
    for (const l of s.lines) latest.set(l.itemId, { order: l.finalOrder, by: s.submittedBy, at: s.submittedAt });
  }

  const bySection = new Map<string, { info: ItemInfo["section"]; lines: (CombinedLine & { sortOrder: number })[] }>();
  for (const [itemId, l] of latest) {
    const info = items.get(itemId);
    if (!info || l.order <= 0) continue;
    const group = bySection.get(info.section.id) ?? { info: info.section, lines: [] };
    group.lines.push({
      itemId,
      name: info.name,
      unit: info.unit,
      order: l.order,
      countedBy: l.by,
      countedAt: l.at,
      sortOrder: info.sortOrder,
    });
    bySection.set(info.section.id, group);
  }

  const sections = [...bySection.values()]
    .sort((a, b) => byPosition(a.info, b.info))
    .map(({ info, lines }) => ({
      id: info.id,
      name: info.name,
      lines: lines.sort(byPosition).map((l) => ({
        itemId: l.itemId,
        name: l.name,
        unit: l.unit,
        order: l.order,
        countedBy: l.countedBy,
        countedAt: l.countedAt,
      })),
    }));

  return { submissions: chronological.map((s) => ({ by: s.submittedBy, at: s.submittedAt })), sections };
}

const slackDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "2-digit",
  day: "2-digit",
  year: "numeric",
});

/** "2026-11-20" -> "Fri 11/20/2026" */
export function formatSlackDate(ymd: string): string {
  const parts = Object.fromEntries(slackDate.formatToParts(dateOnly(ymd)).map((p) => [p.type, p.value]));
  return `${parts.weekday} ${parts.month}/${parts.day}/${parts.year}`;
}

/**
 * Slack text, e.g.
 *
 *   Kaizen Inventory Order, Fri 11/20/2026
 *
 *   PERISHABLES
 *   - Bananas: 3 bunches
 */
export function formatSlack(ymd: string, order: CombinedOrder): string {
  const header = `Kaizen Inventory Order, ${formatSlackDate(ymd)}`;
  if (order.sections.length === 0) return `${header}\n\nNothing to order.`;
  const body = order.sections
    .map((s) => [s.name.toUpperCase(), ...s.lines.map((l) => `- ${l.name}: ${formatQty(l.order)} ${l.unit}`)].join("\n"))
    .join("\n\n");
  return `${header}\n\n${body}`;
}
