import { Suspense } from "react";
import { ContentSpinner } from "@/components/spinner";
import { requireAdmin } from "@/lib/auth/dal";
import { cafeUnits, getOwnedItem, toRule } from "@/lib/admin/data";
import { prisma } from "@/lib/db";
import { formatQty } from "@/lib/quantity";
import { laDateString } from "@/lib/time";
import { BackLink, Card, ColorDot, PageTitle } from "@/components/admin/admin-chrome";
import { DeleteItemButton } from "@/components/admin/delete-item-button";
import { ItemEditor } from "@/components/admin/item-editor";
import { deleteItem, updateItem } from "../../actions";

async function ItemAdmin({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;
  const item = await getOwnedItem(session.current.cafeId, id);
  const [dbRules, units] = await Promise.all([
    prisma.quantityRule.findMany({ where: { itemId: item.id } }),
    cafeUnits(session.current.cafeId),
  ]);
  const rules = dbRules.map(toRule);
  const today = laDateString();
  const def = rules.find((r) => r.type === "DEFAULT");
  const q = (n: number) => formatQty(n);

  return (
    <>
      <BackLink href={`/admin/sections/${item.sectionId}`}>
        <span className="ml-1 inline-flex items-center gap-2">
          <ColorDot color={item.section.color} size={10} />
          {item.section.name}
        </span>
      </BackLink>
      <PageTitle>{item.name}</PageTitle>

      <div className="flex flex-col gap-6">
        <Card>
          <ItemEditor
            action={updateItem.bind(null, item.id)}
            units={units}
            today={today}
            submitLabel="Save changes"
            initial={{
              name: item.name,
              unit: item.unit,
              min: def ? q(def.min) : "",
              max: def ? q(def.max) : "",
              weekdays: rules
                .filter((r) => r.type === "WEEKDAY")
                .map((r) => ({ day: r.weekday!, min: q(r.min), max: q(r.max) })),
              // Only upcoming dates are editable; past ones are kept for history.
              dates: rules
                .filter((r) => r.type === "DATE" && r.date! >= today)
                .sort((a, b) => a.date!.localeCompare(b.date!))
                .map((r) => ({ date: r.date!, min: q(r.min), max: q(r.max) })),
            }}
          />
        </Card>
        <DeleteItemButton action={deleteItem.bind(null, item.id)} itemName={item.name} />
      </div>
    </>
  );
}

export default function ItemPage(props: PageProps<"/admin/items/[id]">) {
  return (
    <Suspense fallback={<ContentSpinner />}>
      <ItemAdmin params={props.params} />
    </Suspense>
  );
}
