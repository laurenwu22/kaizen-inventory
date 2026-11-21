"use client";

import { useEffect, useState } from "react";
import { ui } from "./ui";

/**
 * Copies the order text for pasting into Slack. If the phone blocks clipboard
 * access, shows the text selected so it can be copied by hand.
 */
export function CopyForSlack({ text, className = "" }: { text: string; className?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");

  useEffect(() => {
    if (status !== "copied") return;
    const t = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(t);
  }, [status]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("manual");
    }
  }

  return (
    <div className={className}>
      <button type="button" onClick={copy} className={`${ui.secondary} h-14 w-full gap-2 text-base`}>
        {status === "copied" ? (
          <>
            Copied
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="text-[#4d7a55]">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </>
        ) : (
          "Copy for Slack"
        )}
      </button>
      {status === "manual" && (
        <div className="mt-3">
          <p className="mb-1 text-sm text-ink/60">Copying isn&apos;t allowed here. Select the text below and copy it:</p>
          <textarea
            readOnly
            value={text}
            rows={Math.min(14, text.split("\n").length + 1)}
            onFocus={(e) => e.currentTarget.select()}
            autoFocus
            className="w-full rounded-xl bg-white p-3 font-mono text-sm ring-1 ring-ink/20"
          />
        </div>
      )}
    </div>
  );
}
