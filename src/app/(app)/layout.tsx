import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Nav } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await auth();
  if (!s?.user?.email) redirect("/login");
  const user = {
    email: s.user.email,
    role: (s.user as { role?: "member" | "admin" }).role ?? "member",
  };
  return (
    <div>
      <Nav user={user} />
      {children}
    </div>
  );
}
