"use client";

import { useFormStatus } from "react-dom";
import { selectCafe } from "@/app/actions/auth";
import { Spinner } from "./spinner";

// Our own chevron (instead of the browser's) so there's room to its right on every browser.
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2323211e' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

export function CafeSwitcher({ current, cafes }: { current: string; cafes: { id: string; name: string }[] }) {
  return (
    <form action={selectCafe} className="flex items-center gap-2">
      <label className="sr-only" htmlFor="cafe-switcher">Cafe</label>
      <select
        id="cafe-switcher"
        name="cafeId"
        defaultValue={current}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="mt-1 h-9 appearance-none rounded-full bg-paper/70 bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9 pl-3 text-sm font-medium text-ink ring-1 ring-ink/15"
        style={{ backgroundImage: CHEVRON }}
      >
        {cafes.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <SwitchingIndicator />
    </form>
  );
}

function SwitchingIndicator() {
  const { pending } = useFormStatus();
  return pending ? <Spinner size={16} className="mt-1 text-gold" /> : null;
}
