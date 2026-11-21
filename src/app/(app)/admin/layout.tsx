import { AdminTabs } from "@/components/admin/admin-tabs";

// Admin sub-tabs stay on screen while moving between admin pages.
// Each admin page still checks requireAdmin() itself.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-4 pt-5">
        <AdminTabs />
      </div>
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-5 pb-16">{children}</section>
    </>
  );
}
