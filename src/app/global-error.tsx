"use client";

// User-defined global error boundary per Next.js 16 docs. Replaces the
// framework-synthesized fallback; required for any catastrophic-error
// rendering path. Intentionally minimal — production-grade error UX is
// out of scope for the org-binding change.

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong.</h2>
        <button onClick={reset}>Try again</button>
      </body>
    </html>
  );
}
