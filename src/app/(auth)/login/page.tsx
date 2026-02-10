"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookBible } from "@fortawesome/pro-duotone-svg-icons";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    await signIn("google", { callbackUrl: "/chat" });
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsLoading(true);
    await signIn("email", { email, callbackUrl: "/chat" });
  };

  return (
    <div className="min-h-dvh overflow-y-auto bg-gradient-to-b from-[#F5F5F0] from-70% to-[#E5E5DD] dark:from-[#2b2a27] dark:from-70% dark:to-[#201f1d]">
      <div className="flex min-h-dvh flex-col px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8">
        {/* Logo in upper left */}
        <div className="shrink-0">
          <div className="flex items-center gap-2">
            <span
              className="flex items-center justify-center"
              style={
                {
                  fontSize: "1.75rem",
                  lineHeight: 1,
                  "--fa-primary-color": "#ffffff",
                  "--fa-primary-opacity": "1",
                  "--fa-secondary-color": "#ae5630",
                  "--fa-secondary-opacity": "1",
                } as React.CSSProperties
              }
            >
              <FontAwesomeIcon icon={faBookBible} />
            </span>
            <span className="font-sans text-sm font-medium text-[#6b6a68] dark:text-[#9a9893]">
              BTS Web
            </span>
          </div>
        </div>

        {/* Centered Content - pb offsets for header so content appears truly centered */}
        <div className="flex flex-1 items-center justify-center pb-16 sm:pb-20">
          <div className="w-full max-w-md">
            {/* CTA Headline */}
            <div className="mb-6 text-center sm:mb-8">
              <h1 className="text-2xl leading-tight font-bold whitespace-nowrap text-[#1a1a18] sm:text-3xl dark:text-[#eee]">
                Translate God&apos;s word even better.
              </h1>
              <p className="mt-3 text-sm font-medium whitespace-nowrap text-[#ae5630] sm:mt-4 sm:text-base">
                Conversational interface to curated translation resources
              </p>
            </div>

            {/* Login Card */}
            <div className="rounded-2xl border border-[#00000010] bg-white p-5 shadow-sm sm:rounded-3xl sm:p-6 md:p-8 dark:border-[#6c6a6040] dark:bg-[#1f1e1b]">
              {/* Google Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#00000015] bg-white px-3 py-2.5 text-sm font-medium text-[#1a1a18] transition-colors hover:border-[#ae5630]/50 hover:bg-[#f5f5f0] disabled:cursor-not-allowed disabled:opacity-50 sm:py-3 sm:text-base dark:border-[#6c6a6040] dark:bg-[#2b2a27] dark:text-[#eee] dark:hover:bg-[#393937]"
              >
                {/* Google Logo */}
                <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {isLoading ? "Signing in..." : "Continue with Google"}
              </button>

              {/* Divider */}
              <div className="my-5 flex items-center gap-3 sm:my-6 sm:gap-4">
                <div className="h-px flex-1 bg-[#00000015] dark:bg-[#6c6a6040]" />
                <span className="text-xs text-[#8a8985] sm:text-sm dark:text-[#6b6a68]">
                  or
                </span>
                <div className="h-px flex-1 bg-[#00000015] dark:bg-[#6c6a6040]" />
              </div>

              {/* Email Form */}
              <form onSubmit={handleEmailSignIn}>
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1 block text-sm font-medium text-[#1a1a18] sm:mb-1.5 dark:text-[#eee]"
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-[#00000015] bg-white px-3 py-2 text-sm text-[#1a1a18] placeholder:text-[#8a8985] focus:border-[#ae5630] focus:ring-2 focus:ring-[#ae5630]/20 focus:outline-none sm:px-4 sm:py-2.5 sm:text-base dark:border-[#6c6a6040] dark:bg-[#2b2a27] dark:text-[#eee] dark:placeholder:text-[#6b6a68]"
                    placeholder="you@example.com"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="mt-16 w-full rounded-lg bg-[#ae5630] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#c4633a] hover:shadow-md active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 sm:mt-20 sm:py-3 sm:text-base"
                >
                  {isLoading ? "Signing in..." : "Sign in"}
                </button>
              </form>
            </div>

            {/* Footer */}
            <p className="mt-3 text-center font-sans text-[10px] text-[#8a8985] dark:text-[#6b6a68]">
              BT Servant Web v1.1.1
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
