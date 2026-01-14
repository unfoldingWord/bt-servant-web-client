import NextAuth from "next-auth";
import authConfig from "./auth.config";

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
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
        session.user.image = token.picture as string | undefined;
      }
      return session;
    },
  },
});
