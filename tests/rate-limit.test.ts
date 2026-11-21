import { describe, expect, it } from "vitest";
import { clientIp, decide } from "@/lib/auth/rate-limit";

describe("rate limit decision", () => {
  it("allows under the per-IP limit", () => {
    expect(decide({ ipFailures: 4, globalFailures: 0, ipIsTrusted: false })).toEqual({ allowed: true });
  });
  it("blocks an IP at 5 failures, even a trusted one", () => {
    expect(decide({ ipFailures: 5, globalFailures: 0, ipIsTrusted: true })).toEqual({ allowed: false, reason: "ip" });
  });
  it("during a global spike, blocks unknown IPs but allows trusted ones", () => {
    expect(decide({ ipFailures: 0, globalFailures: 100, ipIsTrusted: false })).toEqual({ allowed: false, reason: "global" });
    expect(decide({ ipFailures: 0, globalFailures: 100, ipIsTrusted: true })).toEqual({ allowed: true });
  });
});

describe("clientIp", () => {
  it("uses the first x-forwarded-for entry", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });
  it("falls back to x-real-ip, then unknown", () => {
    expect(clientIp(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
