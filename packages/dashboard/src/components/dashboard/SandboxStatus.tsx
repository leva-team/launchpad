import type { SandboxStatus as SandboxStatusType } from "@launchpad/shared";

interface SandboxStatusProps {
  status: SandboxStatusType;
  size?: "sm" | "md";
}

const statusConfig: Record<
  SandboxStatusType,
  { label: string; dotClass: string; badgeClass: string }
> = {
  provisioning: {
    label: "Provisioning",
    dotClass: "bg-yellow-400 animate-pulse",
    badgeClass: "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
  },
  running: {
    label: "Running",
    dotClass: "bg-emerald-400",
    badgeClass: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  },
  stopped: {
    label: "Stopped",
    dotClass: "bg-gray-400",
    badgeClass: "bg-gray-400/10 text-gray-400 border-gray-400/20",
  },
  terminated: {
    label: "Terminated",
    dotClass: "bg-red-400",
    badgeClass: "bg-red-400/10 text-red-400 border-red-400/20",
  },
  error: {
    label: "Error",
    dotClass: "bg-red-500 animate-pulse",
    badgeClass: "bg-red-500/10 text-red-400 border-red-500/20",
  },
};

export function SandboxStatus({ status, size = "sm" }: SandboxStatusProps) {
  const config = statusConfig[status];

  const sizeClasses =
    size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${config.badgeClass} ${sizeClasses}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dotClass}`} />
      {config.label}
    </span>
  );
}
