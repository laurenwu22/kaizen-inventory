import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { AppHeader } from "@/components/app-header";

// Employee view. Counting, sections and submit arrive in build step 4.

async function InventoryHome() {
  const session = await requireUser();
  return (
    <>
      <AppHeader session={session} active="inventory" />
      <section className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="rounded-2xl bg-white p-6 text-ink/70 ring-1 ring-ink/10">
          Today&apos;s inventory sections for {session.current.cafeName} will appear here.
        </div>
      </section>
    </>
  );
}

export default function InventoryPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<p className="p-6 text-ink/60">Loading…</p>}>
        <InventoryHome />
      </Suspense>
    </main>
  );
}
