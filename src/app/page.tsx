import { Suspense } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/dal";
import { PinPad } from "./pin-pad";

// Landing page: PIN pad only (no inventory status is shown before sign-in).

async function RedirectIfSignedIn() {
  const session = await getSession();
  if (session?.current) redirect("/inventory");
  if (session) redirect("/select-cafe");
  return null;
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <Image src="/logo.png" alt="" width={112} height={113} priority className="mb-4" />
      <h1 className="mb-8 text-xs font-semibold uppercase tracking-[0.2em] text-gold">Kaizen Inventory</h1>
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <PinPad />
    </main>
  );
}
