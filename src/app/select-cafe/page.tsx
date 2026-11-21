import { Suspense } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/dal";
import { selectCafe, signOut } from "@/app/actions/auth";
import { ContentSpinner, PendingButton } from "@/components/spinner";

async function CafeChoices() {
  const session = await getSession();
  if (!session) redirect("/");

  if (session.memberships.length === 0) {
    return (
      <div className="text-center">
        <p className="mb-6 text-ink/70">
          You&apos;re not assigned to a cafe yet. Ask an admin to add you.
        </p>
        <form action={signOut}>
          <PendingButton className="h-12 rounded-xl px-6 text-ink/80 ring-1 ring-ink/20">Sign out</PendingButton>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <p className="mb-6 text-center text-ink/70">
        Hi {session.user.firstName}, which cafe are you at?
      </p>
      <div className="flex flex-col gap-3">
        {session.memberships.map((m) => (
          <form key={m.cafeId} action={selectCafe}>
            <input type="hidden" name="cafeId" value={m.cafeId} />
            <PendingButton className="h-16 w-full rounded-2xl bg-white text-lg font-medium shadow-sm ring-1 ring-ink/10 active:bg-cream">
              {m.cafeName}
            </PendingButton>
          </form>
        ))}
      </div>
      <form action={signOut} className="mt-8 text-center">
        <PendingButton className="h-11 px-2 text-sm text-ink/60 underline">Not you? Sign out</PendingButton>
      </form>
    </div>
  );
}

export default function SelectCafePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <Image src="/logo.png" alt="Kaizen & Coffee" width={72} height={73} priority className="mb-4" />
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Choose location</h1>
      <Suspense fallback={<ContentSpinner />}>
        <CafeChoices />
      </Suspense>
    </main>
  );
}
