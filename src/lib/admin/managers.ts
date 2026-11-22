// The "at least one active manager" rule, checked inside a transaction.
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { LastManagerError } from "./employees";

/** Throws LastManagerError (rolling the transaction back) if no active manager would remain. */
export async function assertActiveManager(tx: Prisma.TransactionClient) {
  if ((await tx.user.count({ where: { isManager: true, active: true } })) === 0) throw new LastManagerError();
}
