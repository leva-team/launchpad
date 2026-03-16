import Link from "next/link";
import { cookies } from "next/headers";
import type { Service } from "@launchpad/shared";
import { ServiceCard } from "@/components/service/ServiceCard";

async function getServices(): Promise<Service[]> {
  const baseUrl = `http://localhost:${process.env.PORT ?? "3001"}`;
  const cookieStore = await cookies();
  const token = cookieStore.get("id_token")?.value;

  const res = await fetch(`${baseUrl}/api/services`, {
    headers: { Cookie: `id_token=${token}` },
    cache: "no-store",
  });

  if (!res.ok) return [];
  const data = await res.json();
  return (data as { services?: Service[] }).services ?? [];
}

export default async function ServicesPage() {
  const services = await getServices();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Services</h1>
          <p className="mt-1 text-sm text-gray-400">
            {services.length}개의 서비스가 등록되어 있습니다
          </p>
        </div>
        <Link
          href="/services/new"
          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-200"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Service
        </Link>
      </div>

      {services.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <ServiceCard key={service.serviceId} service={service} />
          ))}
        </div>
      ) : (
        <div className="mt-16 flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 py-20">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-800">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-500"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-medium text-gray-300">
            등록된 서비스가 없습니다
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            새 서비스를 생성하여 인프라를 관리해보세요
          </p>
          <Link
            href="/services/new"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-200"
          >
            서비스 생성하기
          </Link>
        </div>
      )}
    </div>
  );
}
