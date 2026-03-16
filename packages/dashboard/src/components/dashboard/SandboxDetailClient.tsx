"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Sandbox } from "@launchpad/shared";
import { ALLOWED_INSTANCE_TYPES } from "@launchpad/shared";
import { Button } from "@/components/ui/Button";
import { SandboxStatus } from "./SandboxStatus";
import { ProvisioningProgress } from "./ProvisioningProgress";

interface SandboxDetailClientProps {
  sandbox: Sandbox;
}

type SandboxAction = "start" | "stop" | "reboot";

interface SystemInfo {
  uptime: string;
  disk: string;
  memory: string;
  caddy: string;
}

interface OpenCodeProcess {
  name: string;
  pm_id: number;
  pid: number;
  status: string;
  cpu: number;
  memory: number;
  uptime: number;
  restarts: number;
}

const INSTANCE_SPECS: Record<string, { vcpu: number; memory: string }> = {
  "c7i.large": { vcpu: 2, memory: "4 GiB" },
  "c7i.xlarge": { vcpu: 4, memory: "8 GiB" },
};

export function SandboxDetailClient({ sandbox: initialSandbox }: SandboxDetailClientProps) {
  const router = useRouter();
  const [sandbox, setSandbox] = useState(initialSandbox);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [commandResult, setCommandResult] = useState<{ output: string; error: string } | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [processes, setProcesses] = useState<OpenCodeProcess[]>([]);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ label: string; description: string; onConfirm: () => void } | null>(null);
  const [selectedInstanceType, setSelectedInstanceType] = useState(sandbox.instanceType);


  const isRunning = sandbox.status === "running";
  const isStopped = sandbox.status === "stopped";
  const isTerminal = sandbox.status === "terminated" || sandbox.status === "error";

  const runCommand = useCallback(
    async (command: string) => {
      setActionLoading(command);
      setCommandResult(null);
      try {
        const res = await fetch(`/api/sandboxes/${sandbox.sandboxId}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setCommandResult({ output: data.output, error: data.error });
        return data;
      } catch (err) {
        setCommandResult({ output: "", error: err instanceof Error ? err.message : "Failed" });
        return null;
      } finally {
        setActionLoading(null);
      }
    },
    [sandbox.sandboxId]
  );

  const refreshStatus = useCallback(async () => {
    if (!isRunning) return;
    setLoadingInfo(true);
    try {
      const [sysRes, procRes] = await Promise.allSettled([
        runCommand("system-status"),
        runCommand("opencode-status"),
      ]);

      if (sysRes.status === "fulfilled" && sysRes.value?.output) {
        try { setSystemInfo(JSON.parse(sysRes.value.output.trim())); } catch { /* parse fail */ }
      }
      if (procRes.status === "fulfilled" && procRes.value?.output) {
        try {
          const procs = JSON.parse(procRes.value.output.trim());
          setProcesses(procs.map((p: Record<string, unknown>) => ({
            name: p.name,
            pm_id: p.pm_id,
            pid: p.pid,
            status: (p.pm2_env as Record<string, unknown>)?.status ?? "unknown",
            cpu: (p.monit as Record<string, number>)?.cpu ?? 0,
            memory: Math.round(((p.monit as Record<string, number>)?.memory ?? 0) / 1024 / 1024),
            uptime: (p.pm2_env as Record<string, number>)?.pm_uptime ?? 0,
            restarts: (p.pm2_env as Record<string, number>)?.restart_time ?? 0,
          })));
        } catch { /* parse fail */ }
      }
    } finally {
      setLoadingInfo(false);
      setCommandResult(null);
    }
  }, [isRunning, runCommand]);

  useEffect(() => {
    if (isRunning) refreshStatus();
  }, [isRunning, refreshStatus]);

  useEffect(() => {
    if (sandbox.status !== "provisioning") return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/sandboxes/${sandbox.sandboxId}`);
        if (!res.ok) return;
        const { sandbox: updated } = await res.json();
        if (updated) {
          setSandbox(updated);
          if (updated.status !== "provisioning") router.refresh();
        }
      } catch { /* polling */ }
    }, 3000);
    return () => clearInterval(id);
  }, [sandbox.status, sandbox.sandboxId, router]);

  const refreshSandbox = useCallback(async () => {
    try {
      const res = await fetch(`/api/sandboxes/${sandbox.sandboxId}`);
      if (!res.ok) return;
      const { sandbox: updated } = await res.json();
      if (updated) setSandbox(updated);
    } catch { /* ignore */ }
  }, [sandbox.sandboxId]);

  const handleAction = useCallback(
    async (action: SandboxAction) => {
      setActionLoading(action);
      try {
        const res = await fetch(`/api/sandboxes/${sandbox.sandboxId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error ?? `Failed to ${action} sandbox`);
          return;
        }
        await refreshSandbox();
      } catch {
        alert(`Failed to ${action} sandbox`);
      } finally {
        setActionLoading(null);
      }
    },
    [sandbox.sandboxId, refreshSandbox]
  );

  const handleDelete = useCallback(async () => {
    if (!confirm(`"${sandbox.name}" 샌드박스를 삭제합니다. 되돌릴 수 없습니다.`)) return;
    setActionLoading("delete");
    try {
      const res = await fetch(`/api/sandboxes/${sandbox.sandboxId}`, { method: "DELETE" });
      if (!res.ok) { alert("삭제 실패"); return; }
      router.push("/dashboard");
    } catch {
      alert("삭제 실패");
    } finally {
      setActionLoading(null);
    }
  }, [sandbox.sandboxId, sandbox.name, router]);

  function formatUptime(ms: number) {
    if (!ms) return "--";
    const sec = Math.floor((Date.now() - ms) / 1000);
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
    return `${Math.floor(sec / 86400)}d`;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-2 text-sm">
        <Link href="/dashboard" className="text-gray-400 transition-colors hover:text-white">
          Sandboxes
        </Link>
        <ChevronIcon />
        <span className="font-medium text-white">{sandbox.name || sandbox.slug}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{sandbox.name || sandbox.slug}</h1>
            <SandboxStatus status={sandbox.status} size="md" />
          </div>
          {sandbox.slug && (
            <p className="mt-0.5 font-mono text-xs text-gray-500">{sandbox.slug}</p>
          )}
          {sandbox.description && (
            <p className="mt-1 text-sm text-gray-400">{sandbox.description}</p>
          )}
        </div>
        {isRunning && (
          <a
            href={`https://${sandbox.sandboxDomain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            <ExternalIcon />
            OpenCode 접속
          </a>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <InfoCard label="Instance ID" value={sandbox.instanceId || "--"} mono />
        <InfoCard label="Domain" value={sandbox.sandboxDomain} mono />
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3">
          <dt className="text-xs text-gray-500">공개 범위</dt>
          <dd className="mt-1">
            <select
              value={sandbox.visibility ?? "public"}
              onChange={async (e) => {
                const res = await fetch(`/api/sandboxes/${sandbox.sandboxId}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "change-visibility", visibility: e.target.value }),
                });
                if (res.ok) router.refresh();
              }}
              className="rounded-md border border-gray-700 bg-gray-900 px-2 py-0.5 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="public">공개</option>
              <option value="private">비공개</option>
            </select>
          </dd>
        </div>
        <InfoCard label="Created" value={new Date(sandbox.createdAt).toLocaleDateString("ko-KR")} />
      </div>

      {isRunning && loadingInfo && (
        <div className="mt-6 overflow-hidden rounded-full bg-gray-800">
          <div className="h-1 animate-[progress_2s_ease-in-out_infinite] rounded-full bg-blue-500" style={{ width: "40%" }} />
          <style>{`@keyframes progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
        </div>
      )}

      {isRunning && (
        <>
          <div className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">시스템 상태</h2>
              <button
                onClick={refreshStatus}
                disabled={loadingInfo}
                className="text-xs text-gray-400 transition-colors hover:text-white disabled:opacity-50"
              >
                {loadingInfo ? "조회 중..." : "새로고침"}
              </button>
            </div>
            {systemInfo ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <MiniCard label="Uptime" value={systemInfo.uptime} />
                <MiniCard label="Memory" value={systemInfo.memory} />
                <MiniCard label="Disk" value={systemInfo.disk} />
                <MiniCard label="Caddy" value={systemInfo.caddy} statusColor={systemInfo.caddy === "active" ? "emerald" : "red"} />
              </div>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-800/40" />)}
              </div>
            )}
          </div>

          <div className="mt-8">
            <h2 className="text-lg font-semibold text-white">프로세스</h2>
            {processes.length > 0 ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-gray-800">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900/50 text-xs text-gray-400">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Name</th>
                      <th className="px-4 py-2.5 text-left font-medium">Status</th>
                      <th className="px-4 py-2.5 text-left font-medium">PID</th>
                      <th className="px-4 py-2.5 text-left font-medium">CPU</th>
                      <th className="px-4 py-2.5 text-left font-medium">Memory</th>
                      <th className="px-4 py-2.5 text-left font-medium">Uptime</th>
                      <th className="px-4 py-2.5 text-left font-medium">Restarts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {processes.map((proc) => (
                      <tr key={proc.pm_id} className="text-gray-300">
                        <td className="px-4 py-2.5 font-medium text-white">{proc.name}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                            proc.status === "online"
                              ? "bg-emerald-600/20 text-emerald-400"
                              : proc.status === "stopped"
                                ? "bg-gray-600/20 text-gray-400"
                                : "bg-red-600/20 text-red-400"
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              proc.status === "online" ? "bg-emerald-400" : proc.status === "stopped" ? "bg-gray-400" : "bg-red-400"
                            }`} />
                            {proc.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">{proc.pid}</td>
                        <td className="px-4 py-2.5">{proc.cpu}%</td>
                        <td className="px-4 py-2.5">{proc.memory}MB</td>
                        <td className="px-4 py-2.5">{formatUptime(proc.uptime)}</td>
                        <td className="px-4 py-2.5">{proc.restarts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 h-20 animate-pulse rounded-xl bg-gray-800/40" />
            )}
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">인스턴스</h2>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <select
                value={selectedInstanceType}
                onChange={(e) => setSelectedInstanceType(e.target.value)}
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                {ALLOWED_INSTANCE_TYPES.map((t) => {
                  const spec = INSTANCE_SPECS[t];
                  return (
                    <option key={t} value={t}>
                      {t} — {spec ? `${spec.vcpu} vCPU / ${spec.memory}` : ""}
                    </option>
                  );
                })}
              </select>
              {selectedInstanceType !== sandbox.instanceType && (
                <ControlButton
                  onClick={() => setConfirmAction({
                    label: "인스턴스 타입 변경",
                    description: `${sandbox.instanceType} → ${selectedInstanceType}로 변경합니다. 인스턴스가 중지 후 재시작됩니다.`,
                    onConfirm: async () => {
                      await fetch(`/api/sandboxes/${sandbox.sandboxId}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "change-instance-type", instanceType: selectedInstanceType }),
                      });
                      await refreshSandbox();
                    },
                  })}
                  loading={false}
                  disabled={!!actionLoading}
                  color="blue"
                >
                  적용
                </ControlButton>
              )}
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-lg font-semibold text-white">제어</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <ControlButton
                onClick={() => setConfirmAction({
                  label: "OpenCode 재시작",
                  description: "OpenCode 프로세스를 재시작합니다. 실행 중인 작업이 중단될 수 있습니다.",
                  onConfirm: () => runCommand("opencode-restart"),
                })}
                loading={actionLoading === "opencode-restart"}
                disabled={!!actionLoading}
                color="blue"
              >
                <RebootIcon /> OpenCode 재시작
              </ControlButton>
              <ControlButton
                onClick={() => setConfirmAction({
                  label: "OpenCode 중지",
                  description: "OpenCode 프로세스를 중지합니다. 웹 접속이 불가능해집니다.",
                  onConfirm: () => runCommand("opencode-stop"),
                })}
                loading={actionLoading === "opencode-stop"}
                disabled={!!actionLoading}
                color="gray"
              >
                <StopIcon /> OpenCode 중지
              </ControlButton>
              <ControlButton
                onClick={() => runCommand("opencode-logs")}
                loading={actionLoading === "opencode-logs"}
                disabled={!!actionLoading}
                color="gray"
              >
                <LogIcon /> 로그 보기
              </ControlButton>
              <div className="h-8 w-px bg-gray-800" />
              <ControlButton
                onClick={() => setConfirmAction({
                  label: "EC2 재부팅",
                  description: "인스턴스를 재부팅합니다. 1~2분간 접속이 불가능합니다.",
                  onConfirm: () => handleAction("reboot"),
                })}
                loading={actionLoading === "reboot"}
                disabled={!!actionLoading}
                color="amber"
              >
                <RebootIcon /> EC2 재부팅
              </ControlButton>
              <ControlButton
                onClick={() => setConfirmAction({
                  label: "EC2 중지",
                  description: "인스턴스를 중지합니다. 다시 시작하기 전까지 접속할 수 없습니다.",
                  onConfirm: () => handleAction("stop"),
                })}
                loading={actionLoading === "stop"}
                disabled={!!actionLoading}
                color="gray"
              >
                <StopIcon /> EC2 중지
              </ControlButton>
              <ControlButton
                onClick={() => setConfirmAction({
                  label: "샌드박스 삭제",
                  description: `"${sandbox.name}"을 영구 삭제합니다. 모든 데이터가 사라지며 되돌릴 수 없습니다.`,
                  onConfirm: handleDelete,
                })}
                loading={actionLoading === "delete"}
                disabled={!!actionLoading}
                color="red"
              >
                <TrashIcon /> 삭제
              </ControlButton>
            </div>
          </div>
        </>
      )}

      {sandbox.status === "provisioning" && sandbox.provisioningSteps && (
        <div className="mt-8 rounded-xl border border-gray-800 bg-gray-950 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">진행 중...</h2>
          <ProvisioningProgress steps={sandbox.provisioningSteps} errorMessage={sandbox.errorMessage} />
        </div>
      )}

      {isStopped && (
        <div className="mt-12 flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 py-16">
          <h3 className="text-base font-medium text-gray-300">샌드박스가 중지됨</h3>
          <p className="mt-1 text-sm text-gray-500">시작하면 OpenCode에 접속할 수 있습니다.</p>
          <Button className="mt-4" size="sm" onClick={() => handleAction("start")} loading={actionLoading === "start"}>
            <PlayIcon /> Start
          </Button>
        </div>
      )}

      {isTerminal && (
        <div className="mt-12 rounded-xl border border-dashed border-gray-800 py-10">
          <div className="flex flex-col items-center">
            <h3 className="text-base font-medium text-gray-300">샌드박스를 사용할 수 없음</h3>
            {sandbox.errorMessage && (
              <details className="mx-6 mt-4 w-full max-w-2xl">
                <summary className="cursor-pointer rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400 hover:bg-red-500/15">
                  에러 로그 보기
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-400">
                  {sandbox.errorMessage}
                </pre>
              </details>
            )}
          </div>
          <div className="mt-6 flex justify-center gap-2">
            {sandbox.status === "error" && sandbox.instanceId && (
              <ControlButton
                onClick={() => setConfirmAction({
                  label: "인스턴스 시작",
                  description: "중지된 인스턴스를 다시 시작합니다.",
                  onConfirm: () => handleAction("start"),
                })}
                loading={actionLoading === "start"}
                disabled={!!actionLoading}
                color="blue"
              >
                <PlayIcon /> 시작
              </ControlButton>
            )}
            <ControlButton
              onClick={() => setConfirmAction({
                label: "샌드박스 삭제",
                description: `"${sandbox.name}"을 영구 삭제합니다.`,
                onConfirm: handleDelete,
              })}
              loading={actionLoading === "delete"}
              disabled={!!actionLoading}
              color="red"
            >
              <TrashIcon /> 삭제
            </ControlButton>
          </div>
        </div>
      )}

      {commandResult && (commandResult.output || commandResult.error) && (
        <div className="mt-6 rounded-xl border border-gray-800 bg-gray-950 p-4">
          <h3 className="mb-2 text-sm font-medium text-gray-400">실행 결과</h3>
          {commandResult.output && (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-black p-4 font-mono text-xs text-gray-300">
              {commandResult.output}
            </pre>
          )}
          {commandResult.error && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-red-950/30 p-4 font-mono text-xs text-red-400">
              {commandResult.error}
            </pre>
          )}
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirmAction(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-950 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white">{confirmAction.label}</h3>
            <p className="mt-2 text-sm text-gray-400">{confirmAction.description}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="rounded-lg px-4 py-2 text-sm text-gray-400 transition-colors hover:text-white"
              >
                취소
              </button>
              <button
                onClick={() => { confirmAction.onConfirm(); setConfirmAction(null); }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`mt-1 truncate text-sm text-gray-200 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function MiniCard({ label, value, statusColor }: { label: string; value: string; statusColor?: "emerald" | "red" }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2.5">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`mt-0.5 text-sm font-medium ${
        statusColor === "emerald" ? "text-emerald-400" : statusColor === "red" ? "text-red-400" : "text-gray-200"
      }`}>{value}</dd>
    </div>
  );
}

function ControlButton({ onClick, loading, disabled, color, children }: {
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
  color: "blue" | "gray" | "amber" | "red";
  children: React.ReactNode;
}) {
  const colorMap = {
    blue: "border-blue-800 bg-blue-950/50 text-blue-400 hover:bg-blue-900/50",
    gray: "border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800",
    amber: "border-amber-800 bg-amber-950/50 text-amber-400 hover:bg-amber-900/50",
    red: "border-red-800 bg-red-950/50 text-red-400 hover:bg-red-900/50",
  };
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${colorMap[color]}`}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

function Spinner() {
  return <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}
function ChevronIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600"><polyline points="9 18 15 12 9 6" /></svg>;
}
function ExternalIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>;
}
function PlayIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3" /></svg>;
}
function StopIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>;
}
function RebootIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6" /><path d="M2.5 22v-6h6" /><path d="M2.5 11.5a10 10 0 0 1 18.06-4.36L21.5 8" /><path d="M21.5 12.5a10 10 0 0 1-18.06 4.36L2.5 16" /></svg>;
}
function TrashIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>;
}
function LogIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
}

