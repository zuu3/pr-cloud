import { redirect } from "next/navigation";

export default function RootPage() {
  // 실제 홈은 (app)/page.tsx. 여기서는 진입점만.
  redirect("/login");
}
