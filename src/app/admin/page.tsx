import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { AppHeader } from "@/components/app-header";

// Admin view. Sections, items and quantity rules arrive in build step 3.
// requireAdmin() checks the role for the selected cafe on the server; every
// admin Server Action must call it too.

async function AdminHome() {
  const session = await requireAdmin();
  return (
    <>
      <AppHeader session={session} active="admin" />
      <section className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="rounded-2xl bg-white p-6 text-stone-600 ring-1 ring-stone-200">
          Admin tools for {session.current.cafeName} will appear here.
        </div>
      </section>
    </>
  );
}

export default function AdminPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<p className="p-6 text-stone-500">Loading…</p>}>
        <AdminHome />
      </Suspense>
    </main>
  );
}
