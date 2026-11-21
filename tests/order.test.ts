import { describe, expect, it } from "vitest";
import { computeAutoOrder, parseOrder, parseQty, stepCount } from "@/lib/order";
import { buildCountSheet, type SectionInput } from "@/lib/inventory";

describe("computeAutoOrder (SPEC: below min -> max - current, else 0)", () => {
  it("orders up to max when below min", () => {
    expect(computeAutoOrder(1, 2, 4)).toBe(3);
  });
  it("orders nothing when exactly at min", () => {
    expect(computeAutoOrder(2, 2, 4)).toBe(0);
    expect(computeAutoOrder(0.5, 0.5, 2)).toBe(0);
  });
  it("orders nothing above min", () => {
    expect(computeAutoOrder(2.5, 2, 4)).toBe(0);
    expect(computeAutoOrder(10, 2, 4)).toBe(0);
  });
  it("rounds partial amounts up to a whole number", () => {
    expect(computeAutoOrder(0, 2, 4)).toBe(4);
    expect(computeAutoOrder(0.5, 1, 2)).toBe(2); // 1.5 -> 2
    expect(computeAutoOrder(1.5, 2, 4)).toBe(3); // 2.5 -> 3
    expect(computeAutoOrder(0.1, 0.3, 0.3)).toBe(1); // 0.2 -> 1
    expect(computeAutoOrder(1.5, 2, 2)).toBe(1); // 0.5 -> 1
  });
  it("never goes negative even if min > max slipped through", () => {
    expect(computeAutoOrder(3, 5, 2)).toBe(0);
  });
});

describe("parseQty", () => {
  it("accepts counts like 2, 0.5, .5, 1.25", () => {
    expect(parseQty("2")).toBe(2);
    expect(parseQty("0.5")).toBe(0.5);
    expect(parseQty(".5")).toBe(0.5);
    expect(parseQty(" 1.25 ")).toBe(1.25);
  });
  it("rejects blanks, negatives, too many decimals and text", () => {
    for (const bad of ["", "-1", "1.234", "abc", "1e3"]) expect(parseQty(bad), bad).toBeNull();
  });
});

describe("parseOrder (whole numbers only)", () => {
  it("accepts whole numbers", () => {
    expect(parseOrder("0")).toBe(0);
    expect(parseOrder(" 12 ")).toBe(12);
  });
  it("rejects halves, blanks, negatives and text", () => {
    for (const bad of ["2.5", "0.5", "", "-1", "abc", "2."]) expect(parseOrder(bad), bad).toBeNull();
  });
});

describe("stepCount", () => {
  it("steps by 0.5 and never below 0", () => {
    expect(stepCount("", 1)).toBe("0.5");
    expect(stepCount("", -1)).toBe("0");
    expect(stepCount("2", 1)).toBe("2.5");
    expect(stepCount("0.5", -1)).toBe("0");
    expect(stepCount("0", -1)).toBe("0");
    expect(stepCount("1.2", 1)).toBe("1.7");
  });
});

describe("buildCountSheet", () => {
  const rule = (min: number, max: number) => ({ type: "DEFAULT" as const, weekday: null, date: null, min, max });
  const base: SectionInput[] = [
    {
      id: "milk", name: "Milk", color: "#4f7896", sortOrder: 1, active: true, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], extraDates: [],
      items: [
        { id: "oat", name: "Oat", unit: "cartons", sortOrder: 1, active: true, rules: [rule(6, 18)] },
        { id: "whole", name: "Whole", unit: "gallons", sortOrder: 0, active: true, rules: [rule(10, 30), { type: "WEEKDAY", weekday: 5, date: null, min: 20, max: 40 }] },
        { id: "old", name: "Old", unit: "x", sortOrder: 2, active: false, rules: [rule(1, 2)] },
      ],
    },
    {
      id: "per", name: "Perishables", color: "#6b8f71", sortOrder: 0, active: true, daysOfWeek: [1, 3, 5], extraDates: ["2026-11-26"],
      items: [{ id: "ban", name: "Bananas", unit: "bunches", sortOrder: 0, active: true, rules: [rule(2, 4)] }],
    },
    { id: "empty", name: "Empty", color: "#000", sortOrder: 2, active: true, daysOfWeek: [5], extraDates: [], items: [] },
    { id: "off", name: "Off", color: "#000", sortOrder: 3, active: false, daysOfWeek: [5], extraDates: [], items: [{ id: "x", name: "X", unit: "x", sortOrder: 0, active: true, rules: [rule(1, 1)] }] },
  ];

  it("orders sections and items by admin position and drops inactive/empty", () => {
    const sheet = buildCountSheet(base, "2026-11-20"); // Friday
    expect(sheet.map((s) => s.id)).toEqual(["per", "milk"]);
    expect(sheet[1].items.map((i) => i.id)).toEqual(["whole", "oat"]);
  });

  it("marks scheduled sections and resolves today's amounts", () => {
    const fri = buildCountSheet(base, "2026-11-20");
    expect(fri.find((s) => s.id === "per")!.scheduled).toBe(true);
    expect(fri.find((s) => s.id === "milk")!.items[0]).toMatchObject({ min: 20, max: 40 }); // Friday override
    const tue = buildCountSheet(base, "2026-11-17");
    expect(tue.find((s) => s.id === "per")!.scheduled).toBe(false);
    expect(tue.find((s) => s.id === "milk")!.items[0]).toMatchObject({ min: 10, max: 30 });
    const thuExtra = buildCountSheet(base, "2026-11-26");
    expect(thuExtra.find((s) => s.id === "per")!.scheduled).toBe(true);
  });

  it("marks a section submitted only when every item was counted today", () => {
    const partial = buildCountSheet(base, "2026-11-20", new Set(["whole"]));
    expect(partial.find((s) => s.id === "milk")!.submittedToday).toBe(false);
    const full = buildCountSheet(base, "2026-11-20", new Set(["whole", "oat", "ban"]));
    expect(full.map((s) => [s.id, s.submittedToday])).toEqual([["per", true], ["milk", true]]);
    expect(buildCountSheet(base, "2026-11-20").every((s) => !s.submittedToday)).toBe(true);
  });
});
