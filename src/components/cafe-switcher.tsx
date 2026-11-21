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
        className="mt-1 h-9 rounded-full bg-paper/70 pl-3 pr-2 text-sm font-medium text-ink ring-1 ring-ink/15"
      >
        {cafes.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </form>
  );
}
