import Link from "next/link";
import { isAdmin, type ActiveSession } from "@/lib/auth/dal";
import { signOut } from "@/app/actions/auth";
import { CafeSwitcher } from "./cafe-switcher";

// Shared header for signed-in pages. The hamburger menu (Create PDF, combined
// order, order history) arrives in later build steps.
export function AppHeader({ session, active }: { session: ActiveSession; active: "inventory" | "admin" }) {
  const admin = isAdmin(session);
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">Welcome back, {session.user.name}</p>
            {session.memberships.length > 1 ? (
              <CafeSwitcher
                current={session.current.cafeId}
                cafes={session.memberships.map((m) => ({ id: m.cafeId, name: m.cafeName }))}
              />
            ) : (
              <p className="text-stone-600">{session.current.cafeName}</p>
            )}
          </div>
          <form action={signOut}>
            <button className="h-11 rounded-xl px-3 text-sm text-stone-600 ring-1 ring-stone-300 active:bg-stone-100">
              Sign out
            </button>
          </form>
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
      className={`flex h-11 items-center rounded-xl px-4 text-sm font-medium ${
        selected ? "bg-stone-900 text-white" : "text-stone-700 ring-1 ring-stone-300 active:bg-stone-100"
      }`}
    >
      {children}
    </Link>
  );
}
