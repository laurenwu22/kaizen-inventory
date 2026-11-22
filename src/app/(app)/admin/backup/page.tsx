import { Suspense } from "react";
import { requireManager } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { compareNames } from "@/lib/quantity";
import { laDateString } from "@/lib/time";
import { PageTitle } from "@/components/admin/admin-chrome";
import { ExportPanel } from "@/components/admin/backup/export-panel";
import { ImportPanel } from "@/components/admin/backup/import-panel";
import { ContentSpinner } from "@/components/spinner";

// Admin > Backup & transfer (managers only): export everything (or a chosen
// part) to a file, and import a file here or into a new copy of the site.

async function Backup() {
  await requireManager();
  const cafes = (await prisma.cafe.findMany({ select: { id: true, name: true } })).sort((a, b) =>
    compareNames(a.name, b.name),
  );
  return (
    <>
      <PageTitle>Backup &amp; transfer</PageTitle>
      <div className="flex flex-col gap-5">
        <ExportPanel cafes={cafes} today={laDateString()} />
        <ImportPanel />
      </div>
    </>
  );
}

export default function BackupPage() {
  return (
    <Suspense fallback={<ContentSpinner />}>
      <Backup />
    </Suspense>
  );
}
