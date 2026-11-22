import { Suspense } from "react";
import Link from "next/link";
import { requireManager } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { compareNames } from "@/lib/quantity";
import { PageTitle } from "@/components/admin/admin-chrome";
import { EmployeeList } from "@/components/admin/employee-list";
import { AddEmployeeModal } from "@/components/admin/add-employee-modal";
import { ContentSpinner, LinkSpinner } from "@/components/spinner";
import { createEmployee } from "./actions";

// Admin > Employees (managers only): everyone in the organization.

async function EmployeesAdmin() {
  const session = await requireManager();
  const [people, cafes] = await Promise.all([
    prisma.user.findMany({ include: { cafes: { include: { cafe: { select: { name: true } } } } } }),
    prisma.cafe.findMany({ select: { id: true, name: true } }),
  ]);
  cafes.sort((a, b) => compareNames(a.name, b.name));
  people.sort((a, b) => compareNames(`${a.firstName} ${a.lastName}`, `${b.firstName} ${b.lastName}`));
  const active = people.filter((p) => p.active);
  const inactive = people.filter((p) => !p.active);

  return (
    <>
      <PageTitle
        action={
          <AddEmployeeModal
            action={createEmployee}
            managedCafes={cafes}
            defaultCafeId={session.current.cafeId}
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
          isManager: p.isManager,
          cafes: p.cafes
            .sort((a, b) => compareNames(a.cafe.name, b.cafe.name))
            .map((m) => `${m.cafe.name}${m.role === "ADMIN" ? " (Admin)" : ""}`),
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
