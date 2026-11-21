import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/dal";
import { selectCafe, signOut } from "@/app/actions/auth";

async function CafeChoices() {
  const session = await getSession();
  if (!session) redirect("/");

  if (session.memberships.length === 0) {
    return (
      <div className="text-center">
        <p className="mb-6 text-stone-600">
          You&apos;re not assigned to a cafe yet. Ask an admin to add you.
        </p>
        <form action={signOut}>
          <button className="h-12 rounded-xl px-6 text-stone-700 ring-1 ring-stone-300">Sign out</button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <p className="mb-6 text-center text-stone-600">
        Hi {session.user.name}, which cafe are you at?
      </p>
      <div className="flex flex-col gap-3">
        {session.memberships.map((m) => (
          <form key={m.cafeId} action={selectCafe}>
            <input type="hidden" name="cafeId" value={m.cafeId} />
            <button className="h-16 w-full rounded-2xl bg-white text-lg font-medium shadow-sm ring-1 ring-stone-200 active:bg-stone-100">
              {m.cafeName}
            </button>
          </form>
        ))}
      </div>
      <form action={signOut} className="mt-8 text-center">
        <button className="text-sm text-stone-500 underline">Not you? Sign out</button>
      </form>
    </div>
  );
}

export default function SelectCafePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Choose location</h1>
      <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
        <CafeChoices />
      </Suspense>
    </main>
  );
}
