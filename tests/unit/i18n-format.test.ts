import { describe, expect, it } from "vitest";
import { formatDay, formatList, formatMonth, formatNumber, formatPercent } from "@/lib/i18n/format";

describe("formatMonth", () => {
  it.each([
    ["2027-07", "en", "long", "July 2027"],
    ["2027-07", "en", "short", "Jul 2027"],
    ["2027-07", "et", "long", "juuli 2027"],
    ["2026-01", "en", "long", "January 2026"],
    ["2026-12", "et", "long", "detsember 2026"],
  ] as const)("%s in %s (%s) → %s", (month, locale, style, text) => {
    expect(formatMonth(month, locale, style)).toBe(text);
  });

  it("defaults to the long style", () => {
    expect(formatMonth("2026-11", "en")).toBe("November 2026");
  });
});

describe("formatDay", () => {
  it.each([
    ["2026-10-12", "en", "12 October"],
    ["2026-10-12", "et", "12. oktoober"],
    ["2025-11-01", "en", "1 November"],
    ["2026-12-31", "et", "31. detsember"],
  ] as const)("%s in %s → %s", (date, locale, text) => {
    expect(formatDay(date, locale)).toBe(text);
  });
});

describe("formatList", () => {
  it.each([
    [["Inflow"], "en", "Inflow"],
    [["Date", "Payee"], "en", "Date and Payee"],
    [["Payee", "Category", "Inflow"], "en", "Payee, Category and Inflow"],
    [["Payee", "Category", "Inflow"], "et", "Payee, Category ja Inflow"],
  ] as const)("%j in %s → %s", (items, locale, text) => {
    expect(formatList(items, locale)).toBe(text);
  });
});

describe("formatNumber / formatPercent", () => {
  it("groups counts the locale's way", () => {
    expect(formatNumber(1284, "en")).toBe("1,284");
    expect(formatNumber(1284, "et")).toBe("1284");
  });

  it.each([
    [990, "en", "9.9"],
    [990, "et", "9,9"],
    [1200, "en", "12"],
    [5, "en", "0.05"],
    [0, "et", "0"],
  ] as const)("%d bps in %s → %s", (bps, locale, text) => {
    expect(formatPercent(bps, locale)).toBe(text);
  });
});
