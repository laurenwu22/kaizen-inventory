import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { BackLink, Card, PageTitle } from "@/components/admin/admin-chrome";
import { DeleteButton } from "@/components/admin/delete-button";
import { EmployeeEditor } from "@/components/admin/employee-editor";
import { ContentSpinner } from "@/components/spinner";
import { setEmployeeActive, updateEmployee } from "../actions";

async function EmployeeAdmin({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;
  // Only people who work at the admin's selected cafe.
  const person = await prisma.user.findFirst({
    where: { id, cafes: { some: { cafeId: session.current.cafeId } } },
    include: { cafes: { include: { cafe: { select: { name: true } } } } },
  });
  if (!person) notFound();

  const managed = session.memberships.filter((m) => m.role === "ADMIN");
  const managedIds = new Set(managed.map((m) => m.cafeId));
  const name = `${person.firstName} ${person.lastName}`;

  return (
    <>
      <BackLink href="/admin/employees">Employees</BackLink>
      <PageTitle>
        <span className="flex items-center gap-3">
          {name}
          {!person.active && (
            <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-ink/60">Deactivated</span>
          )}
        </span>
      </PageTitle>
      <div className="flex flex-col gap-6">
        <Card>
          <EmployeeEditor
            action={updateEmployee.bind(null, person.id)}
            managedCafes={managed.map((m) => ({ id: m.cafeId, name: m.cafeName }))}
            otherMemberships={person.cafes
              .filter((m) => !managedIds.has(m.cafeId))
              .map((m) => ({ cafeName: m.cafe.name, role: m.role }))}
            initial={{
              firstName: person.firstName,
              lastName: person.lastName,
              pin: person.pin,
              memberships: Object.fromEntries(
                person.cafes.filter((m) => managedIds.has(m.cafeId)).map((m) => [m.cafeId, m.role]),
              ),
            }}
            submitLabel="Save changes"
          />
        </Card>
        {person.active ? (
          <DeleteButton
            action={setEmployeeActive.bind(null, person.id, false)}
            name={person.id === session.user.id ? "yourself" : name}
            label="Deactivate"
            verb="deactivate"
            confirmLabel="Yes, deactivate"
          />
        ) : (
          <DeleteButton
            action={setEmployeeActive.bind(null, person.id, true)}
            name={name}
            label="Reactivate"
            verb="reactivate"
            confirmLabel="Yes, reactivate"
            tone="neutral"
          />
        )}
        {person.active && (
          <p className="-mt-3 text-center text-sm text-ink/55">
            Deactivated people can&apos;t sign in at any cafe. Their past counts stay in the order history.
          </p>
        )}
      </div>
    </>
  );
}

export default function EmployeePage(props: PageProps<"/admin/employees/[id]">) {
  return (
    <Suspense fallback={<ContentSpinner />}>
      <EmployeeAdmin params={props.params} />
    </Suspense>
  );
}
