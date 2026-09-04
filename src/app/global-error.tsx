"use client";

import { getInitialLocale, t } from "@/i18n";

// User-defined global error boundary per Next.js 16 docs. Replaces the
// framework-synthesized fallback; required for any catastrophic-error
// rendering path. Intentionally minimal — production-grade error UX is
// out of scope for the org-binding change.
//
// This boundary replaces the root layout, so there is no LocaleProvider
// above it: it renders the initial locale (env pin or default) via the pure
// `t()` and declares that locale on its own <html> root.

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = getInitialLocale();
  return (
    <html lang={locale}>
      <body>
        <h2>{t(locale, "globalError.heading")}</h2>
        <button onClick={reset}>{t(locale, "globalError.retry")}</button>
      </body>
    </html>
  );
}
