import { describe, expect, it } from "vitest";
import { formatList, formatMonth, formatNumber, formatOfMonth, formatOnDay, formatPercent } from "@/lib/i18n/format";

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

describe("formatOnDay", () => {
  it.each([
    ["2026-10-11", "en", "11 October"],
    ["2025-11-01", "en", "1 November"],
    ["2026-12-31", "en", "31 December"],
    ["2026-10-11", "et", "11. oktoobril"],
    ["2025-11-19", "et", "19. novembril"],
    ["2026-01-01", "et", "1. jaanuaril"],
    ["2026-03-31", "et", "31. märtsil"],
    ["2026-05-08", "et", "8. mail"],
  ] as const)("%s in %s → %s", (date, locale, text) => {
    expect(formatOnDay(date, locale)).toBe(text);
  });

  it("has an Estonian form for every month", () => {
    const days = Array.from({ length: 12 }, (_, i) => formatOnDay(`2026-${String(i + 1).padStart(2, "0")}-15`, "et"));
    expect(days).toEqual([
      "15. jaanuaril",
      "15. veebruaril",
      "15. märtsil",
      "15. aprillil",
      "15. mail",
      "15. juunil",
      "15. juulil",
      "15. augustil",
      "15. septembril",
      "15. oktoobril",
      "15. novembril",
      "15. detsembril",
    ]);
  });
});

describe("formatOfMonth", () => {
  it.each([
    ["2026-10", "en", "October 2026"],
    ["2026-10", "et", "2026. aasta oktoobri"],
    ["2027-07", "et", "2027. aasta juuli"],
    ["2025-12", "et", "2025. aasta detsembri"],
  ] as const)("%s in %s → %s", (month, locale, text) => {
    expect(formatOfMonth(month, locale)).toBe(text);
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
