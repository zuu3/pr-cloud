import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { ToastProvider } from "@/components/ui/toast";
import { DialogProvider } from "@/components/ui/dialog";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await auth();
  if (!s?.user?.email) redirect("/login");
  const user = {
    email: s.user.email,
    role: (s.user as { role?: "member" | "admin" }).role ?? "member",
  };
  return (
    <ToastProvider>
      <DialogProvider>
        <Nav user={user} />
        {children}
      </DialogProvider>
    </ToastProvider>
  );
}
