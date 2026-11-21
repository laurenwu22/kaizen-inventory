import { describe, expect, it } from "vitest";
import {
  describeDays,
  formatQty,
  isSectionScheduled,
  resolveForWeekday,
  resolveQuantity,
  type Rule,
} from "@/lib/quantity";

// Bananas from SPEC.md: default 2-4, Saturday 4-6, 2/13/27 5-5.
const bananas: Rule[] = [
  { type: "DEFAULT", weekday: null, date: null, min: 2, max: 4 },
  { type: "WEEKDAY", weekday: 6, date: null, min: 4, max: 6 },
  { type: "DATE", weekday: null, date: "2027-02-13", min: 5, max: 5 },
];

describe("resolveQuantity", () => {
  it("uses the default on an ordinary day", () => {
    // 2026-11-17 is a Tuesday
    expect(resolveQuantity(bananas, "2026-11-17")).toEqual({ min: 2, max: 4, source: "DEFAULT" });
  });

  it("uses the weekday rule on that weekday", () => {
    // 2026-11-21 is a Saturday
    expect(resolveQuantity(bananas, "2026-11-21")).toEqual({ min: 4, max: 6, source: "WEEKDAY" });
  });

  it("date rule beats weekday rule", () => {
    // 2027-02-13 is a Saturday, so both a date and a weekday rule apply
    expect(resolveQuantity(bananas, "2027-02-13")).toEqual({ min: 5, max: 5, source: "DATE" });
  });

  it("date rule only applies on its exact date", () => {
    expect(resolveQuantity(bananas, "2027-02-14")?.source).toBe("DEFAULT"); // Sunday
  });

  it("returns null without a default and no matching rule", () => {
    const onlySat: Rule[] = [{ type: "WEEKDAY", weekday: 6, date: null, min: 1, max: 2 }];
    expect(resolveQuantity(onlySat, "2026-11-17")).toBeNull();
  });

  it("keeps decimals", () => {
    const r: Rule[] = [{ type: "DEFAULT", weekday: null, date: null, min: 0.5, max: 1.5 }];
    expect(resolveQuantity(r, "2026-11-17")).toEqual({ min: 0.5, max: 1.5, source: "DEFAULT" });
  });
});

describe("resolveForWeekday", () => {
  it("ignores date rules", () => {
    expect(resolveForWeekday(bananas, 6)).toEqual({ min: 4, max: 6, source: "WEEKDAY" });
    expect(resolveForWeekday(bananas, 1)).toEqual({ min: 2, max: 4, source: "DEFAULT" });
  });
});

describe("isSectionScheduled", () => {
  const perishables = { daysOfWeek: [1, 3, 5], extraDates: ["2026-11-26"] };
  it("is scheduled on its weekdays", () => {
    expect(isSectionScheduled(perishables, "2026-11-16")).toBe(true); // Monday
    expect(isSectionScheduled(perishables, "2026-11-17")).toBe(false); // Tuesday
  });
  it("is scheduled on an extra date", () => {
    expect(isSectionScheduled(perishables, "2026-11-26")).toBe(true); // Thursday
  });
});

describe("formatting", () => {
  it("formats quantities", () => {
    expect(formatQty(2)).toBe("2");
    expect(formatQty(0.5)).toBe("0.5");
    expect(formatQty(2.25)).toBe("2.25");
    expect(formatQty(1.1 + 2.2)).toBe("3.3");
  });
  it("describes days", () => {
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(describeDays([1, 2, 3, 4, 5])).toBe("Weekdays");
    expect(describeDays([6, 0])).toBe("Weekends");
    expect(describeDays([5, 1, 3])).toBe("Mon, Wed, Fri");
    expect(describeDays([])).toBe("No regular days");
  });
});

describe("compareNames", () => {
  it("sorts alphabetically ignoring case, numbers naturally", async () => {
    const { compareNames } = await import("@/lib/quantity");
    expect(["mint", "Bananas", "cup 10", "Cup 2", "almond"].sort(compareNames)).toEqual([
      "almond",
      "Bananas",
      "Cup 2",
      "cup 10",
      "mint",
    ]);
  });
});
