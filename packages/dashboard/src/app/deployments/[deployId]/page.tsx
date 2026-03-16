import { cookies } from "next/headers";
import { DeploymentDetailClient } from "@/components/deployment/DeploymentDetailClient";

async function getData(deployId: string) {
  const baseUrl = `http://localhost:${process.env.PORT ?? "3001"}`;
  const cookieStore = await cookies();
  const token = cookieStore.get("id_token")?.value;

  const res = await fetch(`${baseUrl}/api/deployments/${deployId}`, {
    headers: { Cookie: `id_token=${token}` },
    cache: "no-store",
  });

  if (!res.ok) return null;
  return res.json();
}

export default async function DeploymentDetailPage({
  params,
}: {
  params: Promise<{ deployId: string }>;
}) {
  const { deployId } = await params;
  const data = await getData(deployId);

  if (!data?.deployment) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-gray-400">배포를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <DeploymentDetailClient
      deployment={data.deployment}
      approval={data.approval}
      qaResults={data.qaResults}
    />
  );
}
