import { Suspense } from "react";
import { ContentSpinner } from "@/components/spinner";
import { requireAdmin } from "@/lib/auth/dal";
import { PageTitle } from "@/components/admin/admin-chrome";
import { ui } from "@/components/ui";

// Employee management arrives in build step 8.

async function EmployeesAdmin() {
  await requireAdmin();
  return (
    <>
      <PageTitle>Employees</PageTitle>
      <div className={`${ui.card} p-6 text-ink/70`}>
        Adding employees, PINs, roles and deactivation is coming soon.
      </div>
    </>
  );
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={<ContentSpinner />}>
      <EmployeesAdmin />
    </Suspense>
  );
}
