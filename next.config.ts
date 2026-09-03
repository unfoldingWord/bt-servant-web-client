import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import packageJson from "./package.json";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  devIndicators: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    // PostHog is OFF unless the key is present at build time (CI secret).
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "",
    NEXT_PUBLIC_POSTHOG_HOST:
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    // Session replay is opt-in per build. Only the production deploy sets it.
    NEXT_PUBLIC_POSTHOG_SESSION_REPLAY:
      process.env.NEXT_PUBLIC_POSTHOG_SESSION_REPLAY ?? "false",
  },
};

export default nextConfig;
