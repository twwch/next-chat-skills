import Google from 'next-auth/providers/google';
import type { NextAuthConfig } from 'next-auth';

// Check if auth is enabled (default: false)
export const isAuthEnabled = process.env.AUTH_ENABLED === 'true';

// Auth config without adapter - safe for Edge Runtime (middleware)
export const authConfig: NextAuthConfig = {
  // Trust host in Docker/production environments
  trustHost: process.env.AUTH_TRUST_HOST === 'true',
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      // Skip auth check if auth is disabled
      if (!isAuthEnabled) return true;

      const isLoggedIn = !!auth?.user;
      const isPublicRoute = nextUrl.pathname.startsWith('/login') ||
                           nextUrl.pathname.startsWith('/api/auth');

      if (isPublicRoute) return true;
      if (isLoggedIn) return true;

      // Redirect to login
      return false;
    },
  },
};
