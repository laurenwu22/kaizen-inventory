import { describe, expect, it } from "vitest";
import { formatSlack, formatSlackDate, mergeDay, type ItemInfo } from "@/lib/combined";

const per = { id: "per", name: "Perishables", sortOrder: 0 };
const milk = { id: "milk", name: "Milk", sortOrder: 1 };
const items = new Map<string, ItemInfo>([
  ["ban", { name: "Bananas", unit: "bunches", sortOrder: 0, section: per }],
  ["cuc", { name: "Cucumber", unit: "gallons", sortOrder: 1, section: per }],
  ["mint", { name: "Mint", unit: "bunches", sortOrder: 2, section: per }],
  ["whole", { name: "Whole", unit: "gallons", sortOrder: 0, section: milk }],
  ["oat", { name: "Oat", unit: "cartons", sortOrder: 1, section: milk }],
]);
const at = (hhmm: string) => new Date(`2026-11-20T${hhmm}:00-08:00`);

describe("mergeDay", () => {
  const order = mergeDay(
    [
      // Listed out of order on purpose: merge must sort by time.
      { submittedAt: at("14:30"), submittedBy: "Dev", lines: [{ itemId: "ban", finalOrder: 3 }, { itemId: "mint", finalOrder: 0 }, { itemId: "whole", finalOrder: 30 }] },
      { submittedAt: at("09:14"), submittedBy: "Maria", lines: [{ itemId: "ban", finalOrder: 1 }, { itemId: "cuc", finalOrder: 2 }, { itemId: "mint", finalOrder: 2 }, { itemId: "oat", finalOrder: 0 }] },
    ],
    items,
  );

  it("latest count wins, including a later 0 that removes an item", () => {
    const lines = order.sections.flatMap((s) => s.lines.map((l) => [l.name, l.order, l.countedBy]));
    expect(lines).toEqual([
      ["Bananas", 3, "Dev"], // Maria said 1 at 9:14, Dev said 3 at 2:30
      ["Cucumber", 2, "Maria"],
      // Mint: Maria 2, then Dev 0 -> not ordered
      ["Whole", 30, "Dev"],
    ]);
  });

  it("groups by section in admin order and leaves out zero orders", () => {
    expect(order.sections.map((s) => s.name)).toEqual(["Perishables", "Milk"]);
    expect(order.sections[1].lines.map((l) => l.name)).toEqual(["Whole"]); // Oat ordered 0
  });

  it("lists submissions in time order", () => {
    expect(order.submissions.map((s) => s.by)).toEqual(["Maria", "Dev"]);
  });

  it("handles a day with no submissions", () => {
    expect(mergeDay([], items)).toEqual({ submissions: [], sections: [] });
  });
});

describe("Slack text", () => {
  it("formats the date like Fri 11/20/2026", () => {
    expect(formatSlackDate("2026-11-20")).toBe("Fri 11/20/2026");
    expect(formatSlackDate("2027-02-03")).toBe("Wed 02/03/2027");
  });

  it("matches the spec format (without Submitted by)", () => {
    const order = mergeDay(
      [
        {
          submittedAt: at("09:00"),
          submittedBy: "Maria",
          lines: [{ itemId: "ban", finalOrder: 3 }, { itemId: "cuc", finalOrder: 2 }, { itemId: "whole", finalOrder: 30 }],
        },
      ],
      items,
    );
    expect(formatSlack("2026-11-20", order)).toBe(
      ["Kaizen Inventory Order, Fri 11/20/2026", "", "PERISHABLES", "- Bananas: 3 bunches", "- Cucumber: 2 gallons", "", "MILK", "- Whole: 30 gallons"].join("\n"),
    );
  });

  it("says so when nothing needs ordering", () => {
    expect(formatSlack("2026-11-20", mergeDay([], items))).toBe("Kaizen Inventory Order, Fri 11/20/2026\n\nNothing to order.");
  });
});
