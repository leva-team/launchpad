"use client";

import type { PipelineStatus } from "@launchpad/shared";

const STAGES = [
  { label: "Build", statuses: ["created", "building", "build_failed"] },
  { label: "STG", statuses: ["deploying_stg", "stg_active", "stg_failed"] },
  { label: "QA", statuses: ["qa_running", "qa_failed", "pending_approval", "rejected"] },
  { label: "PRD", statuses: ["deploying_prd", "ready_for_cutover", "prd_failed"] },
  { label: "Live", statuses: ["live", "rolled_back"] },
] as const;

function getStageState(currentStatus: PipelineStatus, stageStatuses: readonly string[]) {
  if (stageStatuses.includes(currentStatus)) {
    if (currentStatus.endsWith("_failed") || currentStatus === "rejected" || currentStatus === "rolled_back") return "error";
    if (currentStatus === "live" || currentStatus === "stg_active") return "done";
    if (currentStatus === "pending_approval" || currentStatus === "ready_for_cutover") return "waiting";
    return "active";
  }

  const allStatuses: string[] = STAGES.flatMap((s) => [...s.statuses]);
  const currentIdx = allStatuses.indexOf(currentStatus);
  const stageFirstIdx = allStatuses.indexOf(stageStatuses[0] as string);
  if (currentIdx > stageFirstIdx) return "done";
  return "pending";
}

export function PipelineVisualizer({ status }: { status: PipelineStatus }) {
  return (
    <div className="flex items-center gap-1">
      {STAGES.map((stage, i) => {
        const state = getStageState(status, stage.statuses);
        return (
          <div key={stage.label} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                state === "done" ? "bg-emerald-600 text-white" :
                state === "active" ? "bg-blue-600 text-white" :
                state === "waiting" ? "bg-amber-600 text-white" :
                state === "error" ? "bg-red-600 text-white" :
                "bg-gray-800 text-gray-500"
              }`}>
                {state === "done" ? "✓" :
                 state === "active" ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> :
                 state === "error" ? "✗" :
                 state === "waiting" ? "!" :
                 i + 1}
              </div>
              <span className={`text-[10px] font-medium ${
                state === "pending" ? "text-gray-600" : "text-gray-300"
              }`}>{stage.label}</span>
            </div>
            {i < STAGES.length - 1 && (
              <div className={`mx-1 h-0.5 w-6 ${
                state === "done" ? "bg-emerald-600" :
                state === "active" || state === "waiting" ? "bg-blue-600" :
                state === "error" ? "bg-red-600" :
                "bg-gray-800"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  created: "bg-gray-600/20 text-gray-400",
  building: "bg-blue-600/20 text-blue-400",
  build_failed: "bg-red-600/20 text-red-400",
  deploying_stg: "bg-blue-600/20 text-blue-400",
  stg_active: "bg-emerald-600/20 text-emerald-400",
  stg_failed: "bg-red-600/20 text-red-400",
  qa_running: "bg-yellow-600/20 text-yellow-400",
  qa_failed: "bg-red-600/20 text-red-400",
  pending_approval: "bg-purple-600/20 text-purple-400",
  rejected: "bg-red-600/20 text-red-400",
  deploying_prd: "bg-blue-600/20 text-blue-400",
  ready_for_cutover: "bg-amber-600/20 text-amber-400",
  prd_failed: "bg-red-600/20 text-red-400",
  live: "bg-emerald-600/20 text-emerald-400",
  rolled_back: "bg-red-600/20 text-red-400",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? "bg-gray-600/20 text-gray-400"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
