import Link from "next/link";
import type { ActiveSession } from "@/lib/auth/dal";
import { AppHeader } from "@/components/app-header";
import { ui } from "@/components/ui";

/** Header + admin sub-tabs (Sections | Employees) + page body. */
export function AdminChrome({
  session,
  tab,
  children,
}: {
  session: ActiveSession;
  tab: "sections" | "employees";
  children: React.ReactNode;
}) {
  return (
    <>
      <AppHeader session={session} active="admin" />
      <div className="mx-auto w-full max-w-3xl px-4 pt-5">
        <nav className="flex gap-6 border-b border-ink/10" aria-label="Admin">
          <SubTab href="/admin" selected={tab === "sections"}>
            Sections
          </SubTab>
          <SubTab href="/admin/employees" selected={tab === "employees"}>
            Employees
          </SubTab>
        </nav>
      </div>
      <section className="mx-auto w-full max-w-3xl px-4 pt-5 pb-16">{children}</section>
    </>
  );
}

function SubTab({ href, selected, children }: { href: string; selected: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={`-mb-px flex h-11 items-center border-b-2 font-semibold ${
        selected ? "border-gold text-ink" : "border-transparent text-ink/55"
      }`}
    >
      {children}
    </Link>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mb-3 inline-flex h-11 items-center text-sm font-semibold text-ink/60">
      ← {children}
    </Link>
  );
}

export function PageTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
      {action}
    </div>
  );
}

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className={`${ui.card} p-5`}>
      {title && <h2 className={`${ui.sectionTitle} mb-4`}>{title}</h2>}
      {children}
    </div>
  );
}

export function ColorDot({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full"
      style={{ backgroundColor: color, width: size, height: size }}
    />
  );
}

/** ▲▼ reorder buttons; each is its own tiny form posting to a move action. */
export function MoveButtons({
  action,
  idName,
  id,
  isFirst,
  isLast,
  label,
}: {
  action: (fd: FormData) => Promise<void>;
  idName: string;
  id: string;
  isFirst: boolean;
  isLast: boolean;
  label: string;
}) {
  return (
    <div className="flex shrink-0 gap-1.5">
      {(["up", "down"] as const).map((dir) => (
        <form key={dir} action={action}>
          <input type="hidden" name={idName} value={id} />
          <input type="hidden" name="direction" value={dir} />
          <button
            className={ui.iconButton}
            disabled={dir === "up" ? isFirst : isLast}
            aria-label={`Move ${label} ${dir}`}
          >
            {dir === "up" ? "▲" : "▼"}
          </button>
        </form>
      ))}
    </div>
  );
}
