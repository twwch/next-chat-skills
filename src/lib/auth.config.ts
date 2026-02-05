import Google from 'next-auth/providers/google';
import type { NextAuthConfig } from 'next-auth';

// Auth config without adapter - safe for Edge Runtime (middleware)
export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
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
