import NextAuth from "next-auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import authConfig from "./auth.config";

// Get secret from Cloudflare env bindings
const getSecret = () => {
  try {
    const { env } = getCloudflareContext();
    return (
      (env as Record<string, string>).AUTH_SECRET ||
      process.env.AUTH_SECRET ||
      process.env.NEXTAUTH_SECRET
    );
  } catch {
    // Fallback for local development
    return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  }
};

export const { auth, handlers, signIn, signOut } = NextAuth(() => ({
  ...authConfig,
  secret: getSecret(),
  session: {
    strategy: "jwt", // No database needed
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
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
      // Expose token data in session
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
}));
