import { Suspense } from "react";
import { getSession, isManager } from "@/lib/auth/dal";
import { AdminTabs } from "@/components/admin/admin-tabs";

// Admin sub-tabs stay on screen while moving between admin pages. Employees
// and Cafes tabs only show for managers (display only: each page checks
// requireAdmin()/requireManager() itself).

async function Tabs() {
  return <AdminTabs manager={isManager(await getSession())} />;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-4 pt-5">
        <Suspense fallback={<AdminTabs manager={false} />}>
          <Tabs />
        </Suspense>
      </div>
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-5 pb-16">{children}</section>
    </>
  );
}
