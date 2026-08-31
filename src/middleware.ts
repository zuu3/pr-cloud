import { auth } from "@/lib/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const open =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/s/") ||
    pathname === "/api/healthz" ||
    pathname === "/api/cron/sweep";
  if (open) return;

  if (!req.auth?.user) {
    return Response.redirect(new URL("/login", req.url));
  }

  const isAdminArea = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  if (isAdminArea && (req.auth.user as { role?: string }).role !== "admin") {
    return Response.redirect(new URL("/", req.url));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
