import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { cafeUnits, getOwnedSection } from "@/lib/admin/data";
import { AdminChrome, BackLink, Card, PageTitle } from "@/components/admin/admin-chrome";
import { ItemForm } from "@/components/admin/forms";
import { createItem } from "../../../../actions";

async function NewItem({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;
  const section = await getOwnedSection(session.current.cafeId, id);
  const units = await cafeUnits(session.current.cafeId);
  return (
    <AdminChrome session={session} tab="sections">
      <BackLink href={`/admin/sections/${section.id}`}>{section.name}</BackLink>
      <PageTitle>New item</PageTitle>
      <Card>
        <ItemForm action={createItem.bind(null, section.id)} units={units} submitLabel="Create item" />
        <p className="mt-4 text-sm text-ink/55">
          After creating it you can set different amounts for certain weekdays or one-time dates.
        </p>
      </Card>
    </AdminChrome>
  );
}

export default function NewItemPage(props: PageProps<"/admin/sections/[id]/items/new">) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<p className="p-6 text-ink/60">Loading…</p>}>
        <NewItem params={props.params} />
      </Suspense>
    </main>
  );
}
