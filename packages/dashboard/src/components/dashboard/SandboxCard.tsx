"use client";

import { useState } from "react";
import Link from "next/link";
import type { Sandbox } from "@launchpad/shared";
import { SandboxStatus } from "./SandboxStatus";
import { ProvisioningProgress } from "./ProvisioningProgress";

interface SandboxCardProps {
  sandbox: Sandbox;
  onDeleted?: () => void;
  readOnly?: boolean;
}

export function SandboxCard({ sandbox, onDeleted, readOnly }: SandboxCardProps) {
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isAccessible = sandbox.status === "running";
  const canDelete = sandbox.status !== "provisioning" && !readOnly;

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/sandboxes/${sandbox.sandboxId}`, {
        method: "DELETE",
      });
      if (res.ok) onDeleted?.();
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className="group relative rounded-xl border border-gray-800 bg-gray-900/50 transition-all duration-200 hover:border-gray-700 hover:bg-gray-900 hover:shadow-lg hover:shadow-black/20">
      <Link
        href={`/dashboard/${sandbox.sandboxId}`}
        className="block p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-white group-hover:text-gray-100">
              {sandbox.name}
            </h3>
            {sandbox.description && (
              <p className="mt-1 truncate text-sm text-gray-400">
                {sandbox.description}
              </p>
            )}
          </div>
          <SandboxStatus status={sandbox.status} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <InfoItem label="Instance" value={sandbox.instanceType} />
          <InfoItem label="Domain" value={sandbox.sandboxDomain} mono />
        </div>

        {sandbox.status === "provisioning" && sandbox.provisioningSteps && (
          <div className="mt-4">
            <ProvisioningProgress
              steps={sandbox.provisioningSteps}
              errorMessage={sandbox.errorMessage}
            />
          </div>
        )}

        {sandbox.status === "error" && sandbox.errorMessage && (
          <div className="mt-4 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2">
            <p className="text-xs text-red-400">{sandbox.errorMessage}</p>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-gray-800/50 pt-3">
          <span className="text-xs text-gray-500">
            Created {formatRelativeTime(sandbox.createdAt)}
          </span>
          {isAccessible && (
            <span
              role="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(`https://${sandbox.sandboxDomain}`, "_blank");
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600/20 px-2.5 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-600/30"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              접속
            </span>
          )}
        </div>
      </Link>

      {canDelete && (
        <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100">
          {!confirmOpen ? (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setConfirmOpen(true);
              }}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-800 hover:text-red-400"
              title="Delete sandbox"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
          ) : (
            <div
              className="flex items-center gap-1.5"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? "삭제 중..." : "삭제"}
              </button>
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
                className="rounded-md bg-gray-700 px-2 py-1 text-xs font-medium text-gray-300 hover:bg-gray-600"
              >
                취소
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoItem({
  label,
  value,
  className = "",
  mono = false,
}: {
  label: string;
  value: string;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`mt-0.5 truncate text-sm text-gray-300 ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
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
