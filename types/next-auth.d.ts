import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      email: string;
      role: "member" | "admin";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    email?: string;
    role?: "member" | "admin";
  }
}
