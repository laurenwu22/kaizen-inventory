import Link from "next/link";
import { ui } from "@/components/ui";
import { LinkSpinner } from "@/components/spinner";

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mb-3 inline-flex h-11 items-center gap-2 text-sm font-semibold text-ink/60">
      ← {children}
      <LinkSpinner />
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
