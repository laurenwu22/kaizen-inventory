"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { signIn, type SignInState } from "@/app/actions/auth";
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from "@/lib/auth/pin";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function PinPad() {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signIn, {});
  const [digits, setDigits] = useState("");

  const canSubmit = digits.length >= PIN_MIN_LENGTH && !pending;
  const showError = state.error && digits.length === 0 && !pending;

  function press(d: string) {
    setDigits((cur) => (cur.length < PIN_MAX_LENGTH ? cur + d : cur));
  }
  function backspace() {
    setDigits((cur) => cur.slice(0, -1));
  }
  function submit() {
    if (!canSubmit) return;
    const fd = new FormData();
    fd.set("pin", digits);
    setDigits("");
    startTransition(() => formAction(fd));
  }

  // Physical keyboard support for desktop.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") backspace();
      else if (e.key === "Enter") submit();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const keyClass =
    "h-16 rounded-2xl bg-white text-2xl font-medium shadow-sm ring-1 ring-ink/10 " +
    "active:bg-cream disabled:opacity-40 select-none touch-manipulation";

  return (
    <div className="w-full max-w-xs">
      <p className="mb-3 text-center text-ink/70">Enter your Toast PIN</p>

      <div className="mb-2 flex h-6 items-center justify-center gap-3" aria-live="polite">
        {digits.length === 0 ? (
          <span className="text-sm text-ink/40">{pending ? "Signing in…" : " "}</span>
        ) : (
          Array.from({ length: digits.length }).map((_, i) => (
            <span key={i} className="h-3.5 w-3.5 rounded-full bg-ink" />
          ))
        )}
        <span className="sr-only">{digits.length} digits entered</span>
      </div>

      <p role="alert" className="mb-3 h-5 text-center text-sm font-medium text-red-600">
        {showError ? state.error : ""}
      </p>

      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button key={k} type="button" className={keyClass} onClick={() => press(k)} disabled={pending}>
            {k}
          </button>
        ))}
        <button
          type="button"
          className={keyClass}
          onClick={backspace}
          disabled={pending || digits.length === 0}
          aria-label="Delete last digit"
        >
          ⌫
        </button>
        <button type="button" className={keyClass} onClick={() => press("0")} disabled={pending}>
          0
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="h-16 rounded-2xl bg-ink text-lg font-semibold text-white shadow-sm active:bg-ink-hover disabled:opacity-30 select-none touch-manipulation"
        >
          Enter
        </button>
      </div>
    </div>
  );
}
