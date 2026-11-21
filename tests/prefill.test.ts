import { describe, expect, it } from "vitest";
import { BLANK, baselineEntry, isBlank, sameEntry } from "@/lib/prefill";

const sub = (o: Partial<{ count: number | null; finalOrder: number; manuallyEdited: boolean; plenty: boolean }>) => ({
  count: 2,
  finalOrder: 0,
  manuallyEdited: false,
  plenty: false,
  by: "Jo",
  at: "2026-11-20T17:00:00.000Z",
  ...o,
});

describe("baselineEntry", () => {
  it("turns a submitted line into what's shown", () => {
    expect(baselineEntry(sub({ count: 1.5, finalOrder: 3 }))).toEqual({ count: "1.5", order: "3", edited: false, plenty: false });
    expect(baselineEntry(sub({ count: null, plenty: true }))).toEqual({ count: "", order: "0", edited: false, plenty: true });
    expect(baselineEntry(undefined)).toEqual(BLANK);
  });
});

describe("sameEntry (decides what gets re-submitted)", () => {
  const base = baselineEntry(sub({ count: 2, finalOrder: 2 }));
  it("treats equal numbers as unchanged even if typed differently", () => {
    expect(sameEntry({ ...base, count: "2.0" }, base)).toBe(true);
    expect(sameEntry({ ...base, count: " 2 " }, base)).toBe(true);
  });
  it("detects a changed count", () => {
    expect(sameEntry({ ...base, count: "1" }, base)).toBe(false);
  });
  it("detects switching to or from Plenty", () => {
    expect(sameEntry({ ...BLANK, plenty: true }, base)).toBe(false);
    const plenty = baselineEntry(sub({ count: null, plenty: true }));
    expect(sameEntry({ ...BLANK, plenty: true }, plenty)).toBe(true);
    expect(sameEntry({ ...BLANK, count: "3" }, plenty)).toBe(false);
  });
  it("detects a manual order edit, but only compares orders when edited", () => {
    expect(sameEntry({ ...base, edited: true, order: "5" }, base)).toBe(false);
    const editedBase = baselineEntry(sub({ count: 1, finalOrder: 5, manuallyEdited: true }));
    expect(sameEntry({ ...editedBase }, editedBase)).toBe(true);
    expect(sameEntry({ ...editedBase, order: "6" }, editedBase)).toBe(false);
    expect(sameEntry({ ...editedBase, edited: false }, editedBase)).toBe(false); // Reset to automatic
    expect(sameEntry({ ...base, order: "99" }, base)).toBe(true); // order ignored when not edited
  });
  it("blank vs a new count", () => {
    expect(sameEntry({ ...BLANK, count: "1" }, BLANK)).toBe(false);
    expect(sameEntry(BLANK, BLANK)).toBe(true);
    expect(isBlank(BLANK)).toBe(true);
    expect(isBlank({ ...BLANK, plenty: true })).toBe(false);
  });
});
