import NextAuth from "next-auth";
import authConfig from "./auth.config";
import { provisionOrgForEmail } from "./lib/org-resolver";

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  session: {
    strategy: "jwt", // No database needed
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async signIn({ user }) {
      // First sign-in for a Google account auto-provisions email → DEFAULT_ORG
      // in CHAT_ORG_KV. Idempotent — subsequent sign-ins are no-ops, including
      // for partner-specific users whose org was set out-of-band.
      if (user.email) {
        try {
          await provisionOrgForEmail(user.email);
        } catch (error) {
          // Provisioning failure must not block sign-in. The chat route's
          // org resolver falls back to DEFAULT_ORG if KV is unreadable, so
          // the user can still chat with public-org behavior.
          console.error("[auth] CHAT_ORG_KV provisioning failed", {
            email: user.email,
            error,
          });
        }
      }
      return true;
    },
    jwt({ token, user }) {
      // Add user info to token on sign-in
      // Always use email as the user ID for consistency across auth providers
      if (user) {
        token.id = user.email; // Use email, not provider ID
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      return token;
    },
    session({ session, token }) {
      // Expose token data in session. Email is set explicitly (not just
      // relied on from NextAuth's default token→session propagation)
      // because every authenticated route gates on `session.user.email`
      // and 401s if missing — keep that contract local to this file.
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
      }
      return session;
    },
  },
});
