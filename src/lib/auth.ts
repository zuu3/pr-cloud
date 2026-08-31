import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./db";
import { env } from "./env";
import { HttpError } from "./http";

export type SessionRole = "member" | "admin";
export type SessionUser = { email: string; role: SessionRole; name: string | null };

/** E2E-only password-less login. Never enabled in a normal build. */
export const isE2EAuthEnabled = () => process.env.E2E_AUTH === "1";

const e2eProvider = Credentials({
  id: "e2e",
  name: "e2e",
  credentials: { email: {} },
  authorize: async (c) => {
    const email = String(c?.email ?? "");
    const u = await prisma.user.findUnique({ where: { email } });
    return u ? { id: email, email, name: u.name ?? email } : null;
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: { params: { hd: env.GOOGLE_HD, prompt: "select_account" } },
    }),
    ...(isE2EAuthEnabled() ? [e2eProvider] : []),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (isE2EAuthEnabled() && account?.provider === "e2e") return true;
      if (account?.provider !== "google" || !profile) return false;
      const p = profile as {
        hd?: string;
        email?: string;
        email_verified?: boolean;
        sub?: string;
        name?: string;
      };
      if (p.hd !== env.GOOGLE_HD || !p.email || p.email_verified !== true) return false;
      const existing = await prisma.user.findUnique({ where: { email: p.email } });
      if (!existing) return false;
      await prisma.user.update({
        where: { email: p.email },
        data: {
          status: "active",
          name: p.name ?? existing.name,
          googleSub: p.sub ?? existing.googleSub,
        },
      });
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) token.email = user.email;
      if (token.email) {
        const u = await prisma.user.findUnique({ where: { email: token.email as string } });
        token.role = u?.role ?? "member";
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        email: token.email as string,
        role: (token.role as SessionRole) ?? "member",
      };
      return session;
    },
  },
});

export async function requireUser(): Promise<SessionUser> {
  const s = await auth();
  if (!s?.user?.email) throw new HttpError(401, "login required");
  return {
    email: s.user.email,
    role: (s.user as { role?: SessionRole }).role ?? "member",
    name: s.user.name ?? null,
  };
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") throw new HttpError(403, "admin only");
  return u;
}
