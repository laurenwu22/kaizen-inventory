import Image from "next/image";
import Link from "next/link";
import { isAdmin, type ActiveSession } from "@/lib/auth/dal";
import { AppMenu, type MenuItem } from "./app-menu";
import { CafeSwitcher } from "./cafe-switcher";

// Menu entries from SPEC.md. Add an href as each page is built.
const MENU_ITEMS: MenuItem[] = [
  { label: "View today's combined order" }, // build step 5
  { label: "View order history" }, // build step 6
  { label: "Create PDF" }, // build step 7
];

// Shared header for signed-in pages.
export function AppHeader({ session, active }: { session: ActiveSession; active: "inventory" | "admin" }) {
  const admin = isAdmin(session);
  return (
    <header className="border-b border-ink/10 bg-sand pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Image src="/logo.png" alt="Kaizen & Coffee" width={44} height={45} className="shrink-0" />
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight">Welcome back, {session.user.firstName}</p>
              {session.memberships.length > 1 ? (
                <CafeSwitcher
                  current={session.current.cafeId}
                  cafes={session.memberships.map((m) => ({ id: m.cafeId, name: m.cafeName }))}
                />
              ) : (
                <p className="text-ink/70">{session.current.cafeName}</p>
              )}
            </div>
          </div>
          <AppMenu userName={session.user.fullName} cafeName={session.current.cafeName} items={MENU_ITEMS} />
        </div>
        {admin && (
          <nav className="flex gap-2">
            <Tab href="/inventory" selected={active === "inventory"}>Inventory</Tab>
            <Tab href="/admin" selected={active === "admin"}>Admin</Tab>
          </nav>
        )}
      </div>
    </header>
  );
}

function Tab({ href, selected, children }: { href: string; selected: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={`flex h-11 items-center rounded-full px-5 text-sm font-semibold ${
        selected ? "bg-ink text-white" : "bg-paper/60 text-ink/80 ring-1 ring-ink/15 active:bg-cream"
      }`}
    >
      {children}
    </Link>
  );
}
