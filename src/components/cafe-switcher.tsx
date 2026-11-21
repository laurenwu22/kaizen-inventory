"use client";

import { selectCafe } from "@/app/actions/auth";

export function CafeSwitcher({ current, cafes }: { current: string; cafes: { id: string; name: string }[] }) {
  return (
    <form action={selectCafe}>
      <label className="sr-only" htmlFor="cafe-switcher">Cafe</label>
      <select
        id="cafe-switcher"
        name="cafeId"
        defaultValue={current}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="-ml-1 mt-0.5 h-10 rounded-lg bg-transparent pr-2 text-stone-700 ring-1 ring-stone-200"
      >
        {cafes.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </form>
  );
}
