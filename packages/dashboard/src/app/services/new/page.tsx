"use client";

import Link from "next/link";
import { ServiceForm } from "@/components/service/ServiceForm";

export default function NewServicePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-2 text-sm">
        <Link
          href="/services"
          className="text-gray-400 transition-colors hover:text-white"
        >
          Services
        </Link>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-gray-600"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="font-medium text-white">New Service</span>
      </div>

      <h1 className="text-2xl font-bold text-white">서비스 생성</h1>
      <p className="mt-1 text-sm text-gray-400">
        새로운 서비스를 등록합니다. 필수 항목을 모두 입력해주세요.
      </p>

      <div className="mt-8">
        <ServiceForm />
      </div>
    </div>
  );
}
