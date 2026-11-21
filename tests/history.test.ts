import { describe, expect, it } from "vitest";
import { addMonths, isMonth, isYmd, monthGrid, monthLabel, monthRange } from "@/lib/history";

describe("months", () => {
  it("adds months across years", () => {
    expect(addMonths("2026-11", 1)).toBe("2026-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
  it("knows month lengths, including leap years", () => {
    expect(monthRange("2026-11")).toEqual({ first: "2026-11-01", last: "2026-11-30" });
    expect(monthRange("2028-02").last).toBe("2028-02-29");
    expect(monthRange("2027-02").last).toBe("2027-02-28");
  });
  it("labels months", () => {
    expect(monthLabel("2026-11")).toBe("November 2026");
  });
  it("validates inputs", () => {
    expect(isMonth("2026-11")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isYmd("2026-02-30")).toBe(false);
    expect(isYmd("2026-11-20")).toBe(true);
  });
});

describe("monthGrid (Monday first)", () => {
  const grid = monthGrid("2026-11", "2026-11-20");

  it("starts on the Monday before the 1st and ends on a Sunday", () => {
    // Nov 1 2026 is a Sunday, so the grid starts Monday Oct 26.
    expect(grid[0][0].ymd).toBe("2026-10-26");
    expect(grid[0][6].ymd).toBe("2026-11-01");
    expect(grid.at(-1)!.at(-1)!.ymd).toBe("2026-12-06");
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid).toHaveLength(6);
  });

  it("marks in-month, today and future days", () => {
    const cells = grid.flat();
    expect(cells.filter((c) => c.inMonth)).toHaveLength(30);
    expect(cells.find((c) => c.isToday)?.ymd).toBe("2026-11-20");
    expect(cells.find((c) => c.ymd === "2026-11-21")?.isFuture).toBe(true);
    expect(cells.find((c) => c.ymd === "2026-11-19")?.isFuture).toBe(false);
  });

  it("doesn't add an empty trailing week", () => {
    // Feb 2027 starts on a Monday and has exactly 4 weeks.
    const feb = monthGrid("2027-02", "2027-02-01");
    expect(feb).toHaveLength(4);
    expect(feb[0][0].ymd).toBe("2027-02-01");
    expect(feb[3][6].ymd).toBe("2027-02-28");
  });
});
