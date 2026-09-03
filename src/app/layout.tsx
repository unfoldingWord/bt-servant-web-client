import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@/lib/fontawesome";
import { SessionProvider } from "@/components/providers/session-provider";
import { AnalyticsProvider } from "@/components/providers/analytics-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LocaleProvider } from "@/i18n/locale-provider";
import { DEFAULT_LOCALE } from "@/i18n/types";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Metadata is resolved on the server before any client locale is known, so
// it stays in the default locale. Localizing it needs server-side locale
// detection and is out of scope here.
export const metadata: Metadata = {
  title: "BT Servant",
  description: "Your AI Bible Translation assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // SSR default; LocaleProvider updates document.documentElement.lang on
    // the client once the locale is known.
    <html lang={DEFAULT_LOCALE}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <LocaleProvider>
          <SessionProvider>
            <AnalyticsProvider>
              <TooltipProvider>{children}</TooltipProvider>
            </AnalyticsProvider>
          </SessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
