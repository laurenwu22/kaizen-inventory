import { Suspense } from "react";
import { requireManager } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { compareNames } from "@/lib/quantity";
import { laDateString } from "@/lib/time";
import { ExportPanel } from "@/components/admin/backup/export-panel";
import { ImportPanel } from "@/components/admin/backup/import-panel";
import { ContentSpinner } from "@/components/spinner";

// Backup & transfer (managers only, from the menu): export everything (or a chosen
// part) to a file, and import a file here or into a new copy of the site.

async function Backup() {
  await requireManager();
  const cafes = (await prisma.cafe.findMany({ select: { id: true, name: true } })).sort((a, b) =>
    compareNames(a.name, b.name),
  );
  return (
    <div className="flex flex-col gap-5">
      <ExportPanel cafes={cafes} today={laDateString()} />
      <ImportPanel />
    </div>
  );
}

export default function BackupPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 pt-5 pb-16">
      <h1 className="mb-5 text-2xl font-bold tracking-tight">Backup &amp; transfer</h1>
      <Suspense fallback={<ContentSpinner />}>
        <Backup />
      </Suspense>
    </section>
  );
}
