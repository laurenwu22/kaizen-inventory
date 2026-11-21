import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@/lib/db";

// Placeholder for build-order set 1: proves the app can reach the database.
// Replaced by the PIN sign-in landing page in set 2.

async function DbStatus() {
  await connection();
  const cafes = await prisma.cafe
    .findMany({ orderBy: { name: "asc" }, select: { name: true } })
    .catch(() => null);
  if (!cafes) {
    return <p className="text-red-600">Database not reachable. Check DATABASE_URL.</p>;
  }
  return (
    <p className="text-zinc-600">
      Connected. {cafes.length} cafes: {cafes.map((c) => c.name).join(", ")}
    </p>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Kaizen Inventory</h1>
      <Suspense fallback={<p className="text-zinc-500">Checking database…</p>}>
        <DbStatus />
      </Suspense>
    </main>
  );
}
