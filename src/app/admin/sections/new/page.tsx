import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { AdminChrome, BackLink, Card, PageTitle } from "@/components/admin/admin-chrome";
import { SectionForm } from "@/components/admin/forms";
import { createSection } from "../../actions";

async function NewSection() {
  const session = await requireAdmin();
  return (
    <AdminChrome session={session} tab="sections">
      <BackLink href="/admin">Sections</BackLink>
      <PageTitle>New section</PageTitle>
      <Card>
        <SectionForm action={createSection} submitLabel="Create section" />
      </Card>
    </AdminChrome>
  );
}

export default function NewSectionPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<p className="p-6 text-ink/60">Loading…</p>}>
        <NewSection />
      </Suspense>
    </main>
  );
}
