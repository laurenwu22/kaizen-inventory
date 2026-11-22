import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireManager } from "@/lib/auth/dal";
import { compareNames } from "@/lib/quantity";
import { prisma } from "@/lib/db";
import { BackLink, Card, PageTitle } from "@/components/admin/admin-chrome";
import { DeleteButton } from "@/components/admin/delete-button";
import { EmployeeEditor } from "@/components/admin/employee-editor";
import { ContentSpinner } from "@/components/spinner";
import { setEmployeeActive, updateEmployee } from "../actions";

async function EmployeeAdmin({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager();
  const { id } = await params;
  const [person, cafes] = await Promise.all([
    prisma.user.findUnique({ where: { id }, include: { cafes: true } }),
    prisma.cafe.findMany({ select: { id: true, name: true } }),
  ]);
  if (!person) notFound();
  cafes.sort((a, b) => compareNames(a.name, b.name));
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
            managedCafes={cafes}
            initial={{
              firstName: person.firstName,
              lastName: person.lastName,
              pin: person.pin,
              isManager: person.isManager,
              memberships: Object.fromEntries(person.cafes.map((m) => [m.cafeId, m.role])),
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
