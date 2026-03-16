"use client";

import Link from "next/link";
import type { Service } from "@launchpad/shared";

interface ServiceCardProps {
  service: Service;
}

const stageStyles: Record<
  Service["projectStage"],
  { bg: string; text: string; dot: string }
> = {
  concept: {
    bg: "bg-gray-600/20",
    text: "text-gray-400",
    dot: "bg-gray-400",
  },
  development: {
    bg: "bg-blue-600/20",
    text: "text-blue-400",
    dot: "bg-blue-400",
  },
  staging: {
    bg: "bg-yellow-600/20",
    text: "text-yellow-400",
    dot: "bg-yellow-400",
  },
  production: {
    bg: "bg-emerald-600/20",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  deprecated: {
    bg: "bg-red-600/20",
    text: "text-red-400",
    dot: "bg-red-400",
  },
};

export function StageBadge({ stage }: { stage: Service["projectStage"] }) {
  const s = stageStyles[stage];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {stage}
    </span>
  );
}

export function ServiceCard({ service }: ServiceCardProps) {
  return (
    <div className="group relative rounded-xl border border-gray-800 bg-gray-900/50 transition-all duration-200 hover:border-gray-700 hover:bg-gray-900 hover:shadow-lg hover:shadow-black/20">
      <Link href={`/services/${service.serviceId}`} className="block p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-white group-hover:text-gray-100">
              {service.name}
            </h3>
            {service.description && (
              <p className="mt-1 line-clamp-2 text-sm text-gray-400">
                {service.description}
              </p>
            )}
          </div>
          <StageBadge stage={service.projectStage} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-gray-500">Owner Team</dt>
            <dd className="mt-0.5 truncate text-sm text-gray-300">
              {service.ownerTeam}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Firewall</dt>
            <dd className="mt-0.5 truncate text-sm text-gray-300">
              {service.firewallPolicy}
            </dd>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-gray-800/50 pt-3">
          <span className="text-xs text-gray-500">
            Created {formatRelativeTime(service.createdAt)}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            {service.deployStrategy}
          </span>
        </div>
      </Link>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
