import { Suspense } from "react";
import Image from "next/image";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { toRule } from "@/lib/admin/data";
import { isYmd } from "@/lib/history";
import { buildPrintSheet, parseScope } from "@/lib/print";
import { formatQty } from "@/lib/quantity";
import { dateOnly, dateOnlyString, formatYmd, laDateString } from "@/lib/time";
import { ContentSpinner } from "@/components/spinner";
import { PrintOptions } from "@/components/print/print-options";

// Create PDF: a paper count sheet for the selected cafe, for counting by hand
// if the app is down. ?date=YYYY-MM-DD&sections=all
// Always blank: counts already submitted are never printed.

async function PrintSheet({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireUser();
  const cafeId = session.current.cafeId;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const rawDate = one(sp.date);
  const date = isYmd(rawDate) ? rawDate : laDateString();
  const scope = parseScope(one(sp.sections));

  const sections = await prisma.section.findMany({
    where: { cafeId, active: true },
    include: {
      extraDates: { where: { date: dateOnly(date) } },
      items: { where: { active: true }, include: { rules: true } },
    },
  });
  const sheet = buildPrintSheet(
    sections.map((s) => ({
      ...s,
      extraDates: s.extraDates.map((d) => dateOnlyString(d.date)),
      items: s.items.map((i) => ({ ...i, rules: i.rules.map(toRule) })),
    })),
    date,
    scope,
  );

  return (
    <>
      <PrintOptions date={date} scope={scope} canPrint={sheet.length > 0} />

      {/* The sheet: what prints. On screen it's a paper-like preview. */}
      <article className="print-sheet mt-5 rounded-2xl bg-white p-5 text-ink ring-1 ring-ink/10 sm:p-8 print:mt-0 print:rounded-none print:p-0 print:ring-0">
        <header className="mb-5 flex flex-col gap-3 border-b-2 border-ink pb-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={40} height={41} className="shrink-0" />
            <div>
              <h1 className="text-xl font-bold leading-tight">{session.current.cafeName}</h1>
              <p className="text-sm">Inventory count · {formatYmd(date)}</p>
            </div>
          </div>
          <div className="grid w-fit shrink-0 grid-cols-[auto_10rem] items-end gap-x-2 gap-y-3 text-sm sm:pt-1">
            <span>Counted by</span>
            <span className="h-5 border-b border-ink" />
          </div>
        </header>

        {sheet.length === 0 ? (
          <p className="py-8 text-center text-ink/60">
            No sections are scheduled for {formatYmd(date)}. Choose &ldquo;All sections&rdquo; to print everything.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {sheet.map((s) => (
              <section key={s.id} className="print-section">
                <h2 className="mb-1.5 flex items-center gap-2 text-base font-bold">
                  <span className="h-3 w-3 shrink-0 rounded-full print:border print:border-ink" style={{ backgroundColor: s.color }} />
                  {s.name}
                </h2>
                <div className="overflow-x-auto print:overflow-visible">
                  <table className="w-full min-w-[34rem] border-collapse text-sm print:min-w-0">
                    <thead>
                      <tr className="border-b border-ink text-left text-xs uppercase tracking-wide">
                        <th className="py-1.5 pr-2 font-semibold">Item</th>
                        <th className="w-24 py-1.5 pr-2 font-semibold">Unit</th>
                        <th className="w-12 py-1.5 pr-2 text-right font-semibold">Min</th>
                        <th className="w-12 py-1.5 pr-3 text-right font-semibold">Max</th>
                        <th className="w-24 py-1.5 pr-2 font-semibold">Count</th>
                        <th className="w-14 py-1.5 pr-2 text-center font-semibold">Plenty</th>
                        <th className="w-24 py-1.5 font-semibold">To order</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.items.map((i) => (
                        <tr key={i.id} className="border-b border-ink/25">
                          <td className="py-2 pr-2 font-medium">{i.name}</td>
                          <td className="py-2 pr-2">{i.unit}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{formatQty(i.min)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatQty(i.max)}</td>
                          <td className="py-2 pr-2">
                            <span className="block h-6 border-b border-ink/60" />
                          </td>
                          <td className="py-2 pr-2 text-center">
                            <span className="inline-block h-4 w-4 border border-ink align-middle" aria-label="Plenty checkbox" />
                          </td>
                          <td className="py-2">
                            <span className="block h-6 border-b border-ink/60" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}

        <footer className="mt-6 border-t border-ink/40 pt-2 text-xs">
          Order only if the count is below the min: order max − count, rounded up to a whole number. Check
          &ldquo;Plenty&rdquo; if it&apos;s obviously above the min and skip counting it.
        </footer>
      </article>
    </>
  );
}

export default function PrintPage(props: PageProps<"/print">) {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 pt-5 pb-16 print:max-w-none print:p-0">
      <h1 className="mb-5 text-2xl font-bold tracking-tight print:hidden">Create PDF</h1>
      <Suspense fallback={<ContentSpinner />}>
        <PrintSheet searchParams={props.searchParams} />
      </Suspense>
    </section>
  );
}
