import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Sandbox } from "@launchpad/shared";
import { SandboxDetailClient } from "@/components/dashboard/SandboxDetailClient";

async function getSandbox(sandboxId: string): Promise<Sandbox | null> {
  const baseUrl = `http://localhost:${process.env.PORT ?? "3001"}`;
  const cookieStore = await cookies();
  const token = cookieStore.get("id_token")?.value;

  const res = await fetch(`${baseUrl}/api/sandboxes/${sandboxId}`, {
    headers: {
      Cookie: `id_token=${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.sandbox ?? null;
}

export default async function SandboxDetailPage({
  params,
}: {
  params: Promise<{ sandboxId: string }>;
}) {
  const { sandboxId } = await params;
  const sandbox = await getSandbox(sandboxId);

  if (!sandbox) {
    notFound();
  }

  return <SandboxDetailClient sandbox={sandbox} />;
}
