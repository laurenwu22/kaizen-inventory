import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { AdminChrome, PageTitle } from "@/components/admin/admin-chrome";
import { ui } from "@/components/ui";

// Employee management arrives in build step 8.

async function EmployeesAdmin() {
  const session = await requireAdmin();
  return (
    <AdminChrome session={session} tab="employees">
      <PageTitle>Employees</PageTitle>
      <div className={`${ui.card} p-6 text-ink/70`}>
        Adding employees, PINs, roles and deactivation is coming soon.
      </div>
    </AdminChrome>
  );
}

export default function EmployeesPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<p className="p-6 text-ink/60">Loading…</p>}>
        <EmployeesAdmin />
      </Suspense>
    </main>
  );
}
