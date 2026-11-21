import { Suspense } from "react";
import { getSession, type ActiveSession } from "@/lib/auth/dal";
import { AppHeader, AppHeaderSkeleton } from "@/components/app-header";

// Layout for signed-in pages. The header lives here so it stays on screen while
// moving between pages; only the page content below it shows a spinner.
//
// This is display only. Every page still calls requireUser()/requireAdmin(),
// because layouts don't re-run their checks on every navigation.

async function Header() {
  const session = await getSession();
  if (!session?.current) return null; // the page itself redirects
  return <AppHeader session={session as ActiveSession} />;
}

export default function SignedInLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<AppHeaderSkeleton />}>
        <Header />
      </Suspense>
      {children}
    </main>
  );
}
