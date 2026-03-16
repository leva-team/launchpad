import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Service } from "@launchpad/shared";
import { ServiceDetailClient } from "@/components/service/ServiceDetailClient";

async function getService(serviceId: string): Promise<Service | null> {
  const baseUrl = `http://localhost:${process.env.PORT ?? "3001"}`;
  const cookieStore = await cookies();
  const token = cookieStore.get("id_token")?.value;

  const res = await fetch(`${baseUrl}/api/services/${serviceId}`, {
    headers: { Cookie: `id_token=${token}` },
    cache: "no-store",
  });

  if (!res.ok) return null;
  const data = await res.json();
  return (data as { service?: Service }).service ?? null;
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  const service = await getService(serviceId);

  if (!service) {
    notFound();
  }

  return <ServiceDetailClient service={service} />;
}
