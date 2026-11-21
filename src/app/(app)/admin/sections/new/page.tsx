import { Suspense } from "react";
import { ContentSpinner } from "@/components/spinner";
import { requireAdmin } from "@/lib/auth/dal";
import { BackLink, Card, PageTitle } from "@/components/admin/admin-chrome";
import { SectionForm } from "@/components/admin/forms";
import { createSection } from "../../actions";

async function NewSection() {
  await requireAdmin();
  return (
    <>
      <BackLink href="/admin">Sections</BackLink>
      <PageTitle>New section</PageTitle>
      <Card>
        <SectionForm action={createSection} submitLabel="Create section" />
      </Card>
    </>
  );
}

export default function NewSectionPage() {
  return (
    <Suspense fallback={<ContentSpinner />}>
      <NewSection />
    </Suspense>
  );
}
