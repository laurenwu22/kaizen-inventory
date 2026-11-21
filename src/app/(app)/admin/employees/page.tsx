import { Suspense } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { compareNames } from "@/lib/quantity";
import { PageTitle } from "@/components/admin/admin-chrome";
import { EmployeeList } from "@/components/admin/employee-list";
import { AddEmployeeModal } from "@/components/admin/add-employee-modal";
import { ContentSpinner, LinkSpinner } from "@/components/spinner";
import { createEmployee } from "./actions";

// Admin > Employees: everyone who works at the selected cafe.

async function EmployeesAdmin() {
  const session = await requireAdmin();
  const cafeId = session.current.cafeId;
  const managedCafes = session.memberships
    .filter((m) => m.role === "ADMIN")
    .map((m) => ({ id: m.cafeId, name: m.cafeName }));

  const people = await prisma.user.findMany({
    where: { cafes: { some: { cafeId } } },
    include: { cafes: { include: { cafe: { select: { name: true } } } } },
  });
  people.sort((a, b) => compareNames(`${a.firstName} ${a.lastName}`, `${b.firstName} ${b.lastName}`));
  const active = people.filter((p) => p.active);
  const inactive = people.filter((p) => !p.active);

  return (
    <>
      <PageTitle
        action={
          <AddEmployeeModal
            action={createEmployee}
            managedCafes={managedCafes}
            defaultCafeId={cafeId}
            cafeName={session.current.cafeName}
          />
        }
      >
        Employees
      </PageTitle>

      <EmployeeList
        rows={active.map((p) => ({
          id: p.id,
          name: `${p.firstName} ${p.lastName}`,
          pin: p.pin,
          role: p.cafes.find((m) => m.cafeId === cafeId)!.role,
          otherCafes: p.cafes.filter((m) => m.cafeId !== cafeId).map((m) => m.cafe.name),
          isYou: p.id === session.user.id,
        }))}
      />

      {inactive.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer py-2 font-semibold text-ink/60">Deactivated ({inactive.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {inactive.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/admin/employees/${p.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-cream/70 p-3 pl-4 text-ink/60 active:bg-cream"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {p.firstName} {p.lastName}
                  </span>
                  <LinkSpinner />
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
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
