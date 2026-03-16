"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PipelineDeployment, Approval, QAResult } from "@launchpad/shared";
import { PipelineVisualizer, StatusBadge } from "./PipelineVisualizer";
import { isActive } from "@/lib/deployment/state-machine";

interface Props {
  deployment: PipelineDeployment;
  approval: Approval | null;
  qaResults: QAResult[];
}

export function DeploymentDetailClient({ deployment: initial, approval: initApproval, qaResults: initQA }: Props) {
  const router = useRouter();
  const [deploy, setDeploy] = useState(initial);
  const [approval, setApproval] = useState(initApproval);
  const [qaResults, setQAResults] = useState(initQA);
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ label: string; desc: string; action: string } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/deployments/${deploy.deployId}`);
    if (!res.ok) return;
    const data = await res.json();
    setDeploy(data.deployment);
    setApproval(data.approval);
    setQAResults(data.qaResults);
  }, [deploy.deployId]);

  useEffect(() => {
    if (!isActive(deploy.status)) return;
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [deploy.status, refresh]);

  const runAction = useCallback(async (action: string) => {
    setLoading(action);
    try {
      const res = await fetch(`/api/deployments/${deploy.deployId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "Action failed");
        return;
      }
      await refresh();
    } finally {
      setLoading(null);
    }
  }, [deploy.deployId, refresh]);

  const runApproval = useCallback(async (approved: boolean) => {
    if (!approval) return;
    setLoading(approved ? "approve" : "reject");
    try {
      const comment = approved ? "Approved" : prompt("거부 사유를 입력하세요:") ?? "Rejected";
      await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deployId: deploy.deployId, approvalId: approval.approvalId, approved, comment }),
      });
      await refresh();
    } finally {
      setLoading(null);
    }
  }, [deploy.deployId, approval, refresh]);

  const ActionBtn = ({ action, label, color }: { action: string; label: string; color: string }) => {
    const dangerous = ["cutover", "rollback"].includes(action);
    const colorMap: Record<string, string> = {
      blue: "bg-blue-600 hover:bg-blue-500",
      green: "bg-emerald-600 hover:bg-emerald-500",
      red: "bg-red-600 hover:bg-red-500",
      amber: "bg-amber-600 hover:bg-amber-500",
      gray: "bg-gray-700 hover:bg-gray-600",
    };

    return (
      <button
        onClick={() => dangerous ? setConfirmAction({ label, desc: `${label} 작업을 실행합니다.`, action }) : runAction(action)}
        disabled={!!loading}
        className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${colorMap[color]}`}
      >
        {loading === action ? "..." : label}
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
        <Link href="/services" className="hover:text-white">Services</Link>
        <span className="text-gray-600">/</span>
        <Link href={`/services/${deploy.serviceId}`} className="hover:text-white">{deploy.serviceId}</Link>
        <span className="text-gray-600">/</span>
        <span className="text-white">Deployment</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">v{deploy.version}</h1>
          <StatusBadge status={deploy.status} />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-800 bg-gray-950 p-6">
        <PipelineVisualizer status={deploy.status} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {deploy.status === "created" && <ActionBtn action="build" label="빌드 시작" color="blue" />}
        {deploy.status === "stg_active" && <ActionBtn action="start_qa" label="QA 시작" color="blue" />}
        {deploy.status === "qa_running" && (
          <>
            <ActionBtn action="complete_qa" label="QA 통과" color="green" />
            <ActionBtn action="fail_qa" label="QA 실패" color="red" />
          </>
        )}
        {deploy.status === "pending_approval" && approval?.status === "pending" && (
          <>
            <button onClick={() => runApproval(true)} disabled={!!loading} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
              {loading === "approve" ? "..." : "승인"}
            </button>
            <button onClick={() => runApproval(false)} disabled={!!loading} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50">
              {loading === "reject" ? "..." : "거부"}
            </button>
          </>
        )}
        {deploy.status === "ready_for_cutover" && <ActionBtn action="cutover" label="컷오버" color="green" />}
        {["build_failed", "stg_failed", "qa_failed", "prd_failed"].includes(deploy.status) && (
          <ActionBtn action="retry" label="재시도" color="blue" />
        )}
        {!["created", "live", "rolled_back", "rejected"].includes(deploy.status) && (
          <ActionBtn action="rollback" label="롤백" color="red" />
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <h3 className="text-sm font-semibold text-gray-400">QA 결과</h3>
          {qaResults.length > 0 ? (
            <div className="mt-3 space-y-2">
              {qaResults.map((qa) => (
                <div key={qa.qaRunId} className="flex items-center justify-between rounded-lg bg-gray-900 px-3 py-2">
                  <div>
                    <span className="text-sm text-gray-200">{qa.type}</span>
                    {qa.summary && (
                      <span className="ml-2 text-xs text-gray-500">
                        {qa.summary.passed}/{qa.summary.totalTests} passed
                      </span>
                    )}
                  </div>
                  <StatusBadge status={qa.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-600">QA 결과 없음</p>
          )}
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <h3 className="text-sm font-semibold text-gray-400">승인</h3>
          {approval ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-200">승인자: {approval.approverUserId}</span>
                <StatusBadge status={approval.status} />
              </div>
              {approval.comment && <p className="text-xs text-gray-500">{approval.comment}</p>}
              {approval.respondedAt && <p className="text-xs text-gray-600">{new Date(approval.respondedAt).toLocaleString("ko-KR")}</p>}
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-600">승인 요청 없음</p>
          )}
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-gray-800 bg-gray-950 p-5">
        <h3 className="text-sm font-semibold text-gray-400">상태 히스토리</h3>
        <div className="mt-3 space-y-1">
          {deploy.statusHistory.map((entry, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="w-36 shrink-0 text-gray-600">{new Date(entry.at).toLocaleString("ko-KR")}</span>
              <StatusBadge status={entry.status} />
              {entry.reason && <span className="text-gray-500">{entry.reason}</span>}
            </div>
          ))}
        </div>
      </div>

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirmAction(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-950 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white">{confirmAction.label}</h3>
            <p className="mt-2 text-sm text-gray-400">{confirmAction.desc}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmAction(null)} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white">취소</button>
              <button onClick={() => { runAction(confirmAction.action); setConfirmAction(null); }} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
