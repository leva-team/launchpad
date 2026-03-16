"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Approval } from "@launchpad/shared";
import { StatusBadge } from "@/components/deployment/PipelineVisualizer";

export default function ApprovalsPage() {
  const router = useRouter();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/approvals");
      if (!res.ok) return;
      const data = await res.json();
      setApprovals(data.approvals ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleRespond = async (a: Approval, approved: boolean) => {
    const comment = approved ? "Approved" : prompt("거부 사유:") ?? "Rejected";
    setActionLoading(a.approvalId);
    try {
      await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deployId: a.deployId, approvalId: a.approvalId, approved, comment }),
      });
      await fetch_();
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-white">Approvals</h1>
      <p className="mt-1 text-sm text-gray-400">대기 중인 배포 승인 요청</p>

      {loading ? (
        <div className="mt-8 space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-800/40" />)}
        </div>
      ) : approvals.length === 0 ? (
        <div className="mt-12 flex flex-col items-center rounded-xl border border-dashed border-gray-800 py-16">
          <p className="text-sm text-gray-400">대기 중인 승인이 없습니다</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {approvals.map((a) => (
            <div key={a.approvalId} className="rounded-xl border border-gray-800 bg-gray-950 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <Link href={`/deployments/${a.deployId}`} className="text-base font-semibold text-white hover:text-blue-400">
                    {a.serviceName}
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                    <StatusBadge status="pending_approval" />
                    <span>{new Date(a.requestedAt).toLocaleString("ko-KR")}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRespond(a, true)}
                    disabled={!!actionLoading}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {actionLoading === a.approvalId ? "..." : "승인"}
                  </button>
                  <button
                    onClick={() => handleRespond(a, false)}
                    disabled={!!actionLoading}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    거부
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
