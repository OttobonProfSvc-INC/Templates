import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export type Role = "ADMIN" | "CONTRIBUTOR" | "VIEWER";

// Temporary mock users for Phase 2 development.
// This will be replaced by PostgreSQL database queries in Phase 3.
const MOCK_USERS = [
  { id: "1", name: "Admin User", email: "admin@sbloom.com", password: "password123", role: "ADMIN" as Role },
  { id: "2", name: "Content Contributor", email: "contributor@sbloom.com", password: "password123", role: "CONTRIBUTOR" as Role },
  { id: "3", name: "Viewer User", email: "viewer@sbloom.com", password: "password123", role: "VIEWER" as Role },
];

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@sbloom.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }
        const user = MOCK_USERS.find(
          (u) => u.email === credentials.email && u.password === credentials.password
        );
        if (user) {
          // Return user without password
          return { id: user.id, name: user.name, email: user.email, role: user.role };
        }
        return null;
      }
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as Role;
        session.user.id = token.id as string;
      }
      return session;
    }
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET || "development-secret-do-not-use-in-production",
};
