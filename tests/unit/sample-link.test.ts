import { describe, expect, it } from "vitest";
import type { Cents } from "@/lib/money/cents";
import type { PlanInput } from "@/lib/plan/schedule";
import { readSampleLink, writeSampleLink } from "@/lib/sample-link";

const c = (value: number) => value as Cents;
const read = (query: string) => readSampleLink(new URLSearchParams(query));

const plan: PlanInput = { price: c(189000), upfront: c(29000), count: 18, annualRateBps: 990, monthlyFee: c(250) };

describe("readSampleLink", () => {
  it("needs a known sample profile", () => {
    expect(read("")).toBeNull();
    expect(read("sample=")).toBeNull();
    expect(read("sample=rich")).toBeNull();
    expect(read("price=1200&n=12")).toBeNull();
  });

  it("reads a profile on its own", () => {
    expect(read("sample=comfortable")).toEqual({ profile: "comfortable", period: undefined, plan: undefined });
    expect(read("sample=tight")).toEqual({ profile: "tight", period: undefined, plan: undefined });
  });

  it("keeps only offered period lengths", () => {
    expect(read("sample=tight&period=12")?.period).toBe(12);
    expect(read("sample=tight&period=3")?.period).toBe(3);
    expect(read("sample=tight&period=4")?.period).toBeUndefined();
    expect(read("sample=tight&period=6.0")?.period).toBeUndefined();
    expect(read("sample=tight&period=x")?.period).toBeUndefined();
  });

  it("reads the plan as form text, with missing fields as their defaults", () => {
    expect(read("sample=comfortable&price=1200&n=12")?.plan).toEqual({
      price: "1200",
      upfront: "0",
      count: "12",
      rate: "0",
      fee: "0",
    });
    expect(read("sample=comfortable&n=6")?.plan).toEqual({ price: "", upfront: "0", count: "6", rate: "0", fee: "0" });
    expect(read("sample=comfortable&price=900")?.plan?.count).toBe("");
  });

  it("passes unchecked text through, so the form shows what's wrong with it", () => {
    expect(read("sample=comfortable&price=abc&n=99&rate=-1")?.plan).toMatchObject({
      price: "abc",
      count: "99",
      rate: "-1",
    });
  });
});

describe("writeSampleLink", () => {
  it("writes the profile, and the period only when it isn't the default", () => {
    expect(writeSampleLink({ profile: "comfortable", period: 6 })).toBe("?sample=comfortable");
    expect(writeSampleLink({ profile: "tight", period: 12 })).toBe("?sample=tight&period=12");
  });

  it("writes the plan, leaving out zero upfront, rate and fee", () => {
    const simple: PlanInput = { price: c(120000), upfront: c(0), count: 12, annualRateBps: 0, monthlyFee: c(0) };
    expect(writeSampleLink({ profile: "comfortable", period: 6, plan: simple })).toBe(
      "?sample=comfortable&price=1200&n=12",
    );
    expect(writeSampleLink({ profile: "comfortable", period: 3, plan })).toBe(
      "?sample=comfortable&period=3&price=1890&upfront=290&n=18&rate=9.9&fee=2.50",
    );
  });

  it("round-trips through readSampleLink", () => {
    expect(read(writeSampleLink({ profile: "tight", period: 12, plan }).slice(1))).toEqual({
      profile: "tight",
      period: 12,
      plan: { price: "1890", upfront: "290", count: "18", rate: "9.9", fee: "2.50" },
    });
  });
});
