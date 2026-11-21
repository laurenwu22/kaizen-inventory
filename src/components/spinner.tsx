"use client";

import { useFormStatus } from "react-dom";
import { useLinkStatus } from "next/link";

/** Small spinning ring. Inherits the text color. */
export function Spinner({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
      className={`shrink-0 animate-spin ${className}`}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Centered spinner for the part of a page that's loading. */
export function ContentSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-48 flex-1 items-center justify-center text-gold" aria-live="polite">
      <Spinner size={32} />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/**
 * Submit button that shows a spinner while its form is submitting. Keeps its
 * width so the layout doesn't jump.
 */
export function PendingButton({
  children,
  className,
  "aria-label": ariaLabel,
  disabled,
}: {
  children: React.ReactNode;
  className: string;
  "aria-label"?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} aria-label={ariaLabel} aria-busy={pending} className={`relative ${className}`}>
      <span className={pending ? "invisible" : undefined}>{children}</span>
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      )}
    </button>
  );
}

/** Put inside a <Link>: shows a spinner while that link's page is loading. */
export function LinkSpinner({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  return pending ? <Spinner size={16} className={`text-gold ${className}`} /> : null;
}
