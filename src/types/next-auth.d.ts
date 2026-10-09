import { DefaultSession } from "next-auth";

// Extend the built-in session types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "CONTRIBUTOR" | "VIEWER";
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: "ADMIN" | "CONTRIBUTOR" | "VIEWER";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "CONTRIBUTOR" | "VIEWER";
  }
}
