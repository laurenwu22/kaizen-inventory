// Limits PIN guessing. With 3-4 digit PINs there are only ~11,000 possibilities,
// so without this a script could find every employee's PIN quickly.
//
// - Per IP: after 5 failures in 10 minutes (since that IP's last success),
//   sign-in from that IP is blocked until the failures age out.
// - Overall: if there are 100+ failures in an hour across all IPs (an attacker
//   rotating IPs), only IPs with a successful sign-in in the last 30 days
//   (e.g. the cafe's wifi, staff phones) can sign in until it calms down.
import "server-only";
import { prisma } from "@/lib/db";

export const LIMITS = {
  ipMaxFailures: 5,
  ipWindowMs: 10 * 60 * 1000,
  globalMaxFailures: 100,
  globalWindowMs: 60 * 60 * 1000,
  trustedIpWindowMs: 30 * 24 * 60 * 60 * 1000,
  retentionMs: 30 * 24 * 60 * 60 * 1000,
};

export type RateLimitInput = {
  ipFailures: number;
  globalFailures: number;
  ipIsTrusted: boolean;
};

export type RateLimitDecision = { allowed: true } | { allowed: false; reason: "ip" | "global" };

export function decide(input: RateLimitInput, limits = LIMITS): RateLimitDecision {
  if (input.ipFailures >= limits.ipMaxFailures) return { allowed: false, reason: "ip" };
  if (input.globalFailures >= limits.globalMaxFailures && !input.ipIsTrusted) {
    return { allowed: false, reason: "global" };
  }
  return { allowed: true };
}

export async function checkRateLimit(ip: string, now = new Date()): Promise<RateLimitDecision> {
  const ipWindowStart = new Date(now.getTime() - LIMITS.ipWindowMs);
  const [lastSuccess, globalFailures] = await Promise.all([
    prisma.loginAttempt.findFirst({
      where: { ip, success: true },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.loginAttempt.count({
      where: { success: false, createdAt: { gt: new Date(now.getTime() - LIMITS.globalWindowMs) } },
    }),
  ]);
  const since =
    lastSuccess && lastSuccess.createdAt > ipWindowStart ? lastSuccess.createdAt : ipWindowStart;
  const ipFailures = await prisma.loginAttempt.count({
    where: { ip, success: false, createdAt: { gt: since } },
  });
  const ipIsTrusted =
    !!lastSuccess && lastSuccess.createdAt.getTime() > now.getTime() - LIMITS.trustedIpWindowMs;
  return decide({ ipFailures, globalFailures, ipIsTrusted });
}

export async function recordAttempt(ip: string, success: boolean, now = new Date()) {
  await prisma.loginAttempt.create({ data: { ip, success, createdAt: now } });
  // Occasionally prune old rows so the table stays small.
  if (Math.random() < 0.05) {
    await prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - LIMITS.retentionMs) } },
    });
  }
}

/** Client IP. On Vercel, x-forwarded-for / x-real-ip are set by the platform. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
