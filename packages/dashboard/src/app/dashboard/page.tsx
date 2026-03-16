import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { SandboxList } from "@/components/dashboard/SandboxList";
import type { Sandbox } from "@launchpad/shared";
import { cookies } from "next/headers";

async function getSandboxes(): Promise<{ sandboxes: Sandbox[]; shared: Sandbox[] }> {
  const baseUrl = `http://localhost:${process.env.PORT ?? "3001"}`;
  const cookieStore = await cookies();
  const token = cookieStore.get("id_token")?.value;

  const res = await fetch(`${baseUrl}/api/sandboxes`, {
    headers: { Cookie: `id_token=${token}` },
    cache: "no-store",
  });

  if (!res.ok) return { sandboxes: [], shared: [] };
  const data = await res.json();
  return { sandboxes: data.sandboxes ?? [], shared: data.shared ?? [] };
}

export default async function DashboardPage() {
  const { sandboxes, shared } = await getSandboxes();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <DashboardHeader count={sandboxes.length} />
      <SandboxList initialSandboxes={sandboxes} initialShared={shared} />
    </div>
  );
}
