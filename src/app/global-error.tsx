"use client";

import { t } from "@/i18n/t";
import { DEFAULT_LOCALE } from "@/i18n/types";

// User-defined global error boundary per Next.js 16 docs. Replaces the
// framework-synthesized fallback; required for any catastrophic-error
// rendering path. Intentionally minimal — production-grade error UX is
// out of scope for the org-binding change.
//
// This boundary replaces the root layout, so there is no LocaleProvider
// above it: it always renders the default locale via the pure `t()` and
// declares that locale on its own <html> root.

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body>
        <h2>{t(DEFAULT_LOCALE, "globalError.heading")}</h2>
        <button onClick={reset}>
          {t(DEFAULT_LOCALE, "globalError.retry")}
        </button>
      </body>
    </html>
  );
}
