import Image from "next/image";
import Link from "next/link";
import { isAdmin, isManager, type ActiveSession } from "@/lib/auth/dal";
import { AppMenu, type MenuItem } from "./app-menu";
import { CafeSwitcher } from "./cafe-switcher";
import { HeaderTabs } from "./header-tabs";

// Menu entries from SPEC.md. Add an href as each page is built.
const MENU_ITEMS: MenuItem[] = [
  { label: "View today's combined order", href: "/order" },
  { label: "View order history", href: "/history" },
  { label: "Create PDF", href: "/print" },
];
const MANAGER_ITEMS: MenuItem[] = [{ label: "Backup & transfer", href: "/backup" }];

/** Shared header for signed-in pages. Rendered once by the (app) layout. */
export function AppHeader({ session }: { session: ActiveSession }) {
  return (
    <HeaderFrame>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* The logo goes home (today's count) from any page. */}
          <Link href="/inventory" aria-label="Home" className="shrink-0 rounded-full hover:opacity-80">
            <Image src="/logo.png" alt="Kaizen & Coffee" width={44} height={45} priority />
          </Link>
          <div className="min-w-0">
            {session.memberships.length > 1 ? (
              <CafeSwitcher
                current={session.current.cafeId}
                cafes={session.memberships.map((m) => ({ id: m.cafeId, name: m.cafeName }))}
              />
            ) : (
              <p className="font-semibold">{session.current.cafeName}</p>
            )}
          </div>
        </div>
        <AppMenu userName={session.user.fullName} cafeName={session.current.cafeName} items={isManager(session) ? [...MENU_ITEMS, ...MANAGER_ITEMS] : MENU_ITEMS} />
      </div>
      {isAdmin(session) && <HeaderTabs />}
    </HeaderFrame>
  );
}

/** Placeholder with the same shape while the header's data loads. */
export function AppHeaderSkeleton() {
  return (
    <HeaderFrame>
      <div className="flex items-center gap-3">
        <Image src="/logo.png" alt="Kaizen & Coffee" width={44} height={45} className="shrink-0" priority />
        <span className="h-9 w-40 animate-pulse rounded-full bg-ink/10" />
      </div>
    </HeaderFrame>
  );
}

function HeaderFrame({ children }: { children: React.ReactNode }) {
  return (
    <header className="border-b border-ink/10 bg-sand pt-[env(safe-area-inset-top)] print:hidden">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4">{children}</div>
    </header>
  );
}
