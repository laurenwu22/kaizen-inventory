import { describe, expect, it } from "vitest";
import { buildPrintSheet, parseScope } from "@/lib/print";
import type { SectionInput } from "@/lib/inventory";

// 2026-11-23 is a Monday (weekday 1); 2026-11-24 is a Tuesday.
const def = (min: number, max: number) => ({ type: "DEFAULT" as const, weekday: null, date: null, min, max });
const sections: SectionInput[] = [
  {
    id: "s2",
    name: "Sauces",
    color: "#6b8f71",
    sortOrder: 1,
    active: true,
    daysOfWeek: [2],
    extraDates: [],
    items: [{ id: "i3", name: "Mayo", unit: "tubs", sortOrder: 0, active: true, rules: [def(1, 3)] }],
  },
  {
    id: "s1",
    name: "Produce",
    color: "#b09458",
    sortOrder: 0,
    active: true,
    daysOfWeek: [1],
    extraDates: [],
    items: [
      { id: "i2", name: "Limes", unit: "bags", sortOrder: 1, active: true, rules: [def(1, 2)] },
      {
        id: "i1",
        name: "Bananas",
        unit: "bunches",
        sortOrder: 0,
        active: true,
        rules: [def(2, 4), { type: "WEEKDAY", weekday: 1, date: null, min: 3, max: 6 }],
      },
      { id: "i4", name: "Old", unit: "x", sortOrder: 2, active: false, rules: [def(1, 1)] },
    ],
  },
  { id: "s3", name: "Retired", color: "#000000", sortOrder: 2, active: false, daysOfWeek: [1], extraDates: [], items: [] },
];

describe("buildPrintSheet", () => {
  it("prints only sections scheduled that day, with that day's amounts, in admin order", () => {
    const sheet = buildPrintSheet(sections, "2026-11-23", "scheduled");
    expect(sheet.map((s) => s.name)).toEqual(["Produce"]);
    expect(sheet[0].items.map((i) => [i.name, i.min, i.max])).toEqual([
      ["Bananas", 3, 6], // Monday amount
      ["Limes", 1, 2],
    ]);
  });

  it("can print every active section", () => {
    const sheet = buildPrintSheet(sections, "2026-11-23", "all");
    expect(sheet.map((s) => s.name)).toEqual(["Produce", "Sauces"]);
    expect(sheet[0].items[0]).toMatchObject({ name: "Bananas", min: 3, max: 6 });
  });

  it("uses default amounts on other days and includes one-time dates", () => {
    const withExtra = sections.map((s) => (s.id === "s2" ? { ...s, extraDates: ["2026-11-23"] } : s));
    expect(buildPrintSheet(withExtra, "2026-11-23", "scheduled").map((s) => s.name)).toEqual(["Produce", "Sauces"]);
    const tue = buildPrintSheet(sections, "2026-11-24", "all");
    expect(tue[0].items[0]).toMatchObject({ name: "Bananas", min: 2, max: 4 });
  });

  it("reads the scope from the URL", () => {
    expect(parseScope("all")).toBe("all");
    expect(parseScope(undefined)).toBe("scheduled");
    expect(parseScope("anything")).toBe("scheduled");
  });
});
