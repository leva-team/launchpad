"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Service } from "@launchpad/shared";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StageBadge } from "./ServiceCard";
import { ServiceForm } from "./ServiceForm";

interface ServiceDetailClientProps {
  service: Service;
}

export function ServiceDetailClient({
  service: initialService,
}: ServiceDetailClientProps) {
  const router = useRouter();
  const [service, setService] = useState(initialService);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = useCallback(async () => {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/services/${service.serviceId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert((data as { error?: string }).error ?? "삭제 실패");
        return;
      }
      router.push("/services");
    } catch {
      alert("삭제 실패");
    } finally {
      setDeleteLoading(false);
      setConfirmDelete(false);
    }
  }, [service.serviceId, router]);

  const refreshService = useCallback(async () => {
    try {
      const res = await fetch(`/api/services/${service.serviceId}`);
      if (!res.ok) return;
      const data = await res.json();
      const updated = (data as { service?: Service }).service;
      if (updated) setService(updated);
    } catch { /* noop */ }
  }, [service.serviceId]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm">
        <Link
          href="/services"
          className="text-gray-400 transition-colors hover:text-white"
        >
          Services
        </Link>
        <ChevronIcon />
        <span className="font-medium text-white">{service.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{service.name}</h1>
            <StageBadge stage={service.projectStage} />
          </div>
          <p className="mt-1 text-sm text-gray-400">
            {service.ownerTeam} &middot; {service.ownerName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            수정
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={deleteLoading}
            onClick={() => setConfirmDelete(true)}
          >
            삭제
          </Button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <InfoCard label="Purpose" value={service.purpose} />
        <InfoCard label="Description" value={service.description} />
        <InfoCard
          label="SLA Target"
          value={service.slaTarget ? `${service.slaTarget}%` : "--"}
        />
        <InfoCard label="Firewall Policy" value={service.firewallPolicy} />
        <InfoCard label="Deploy Strategy" value={service.deployStrategy} />
        <InfoCard
          label="Repository"
          value={service.repositoryUrl || "--"}
          mono
          href={service.repositoryUrl || undefined}
        />
      </div>

      {/* ECS Config */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-white">ECS Configuration</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <MiniCard label="CPU" value={`${service.ecsConfig.cpu} units`} />
          <MiniCard label="Memory" value={`${service.ecsConfig.memory} MB`} />
          <MiniCard
            label="Desired Count"
            value={service.ecsConfig.desiredCount.toString()}
          />
          <MiniCard
            label="Port"
            value={service.ecsConfig.port.toString()}
          />
        </div>
      </div>

      {/* Linked Sandboxes */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-white">연결된 샌드박스</h2>
        {service.linkedSandboxIds.length > 0 ? (
          <div className="mt-3 space-y-2">
            {service.linkedSandboxIds.map((id) => (
              <Link
                key={id}
                href={`/dashboard/${id}`}
                className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3 text-sm text-gray-300 transition-colors hover:border-gray-700 hover:bg-gray-900 hover:text-white"
              >
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
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <span className="font-mono text-xs">{id}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-gray-800 px-4 py-6 text-center text-sm text-gray-500">
            연결된 샌드박스 없음
          </div>
        )}
      </div>

      {/* Architecture Links */}
      {service.architectureLinks.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-white">
            Architecture Links
          </h2>
          <div className="mt-3 space-y-2">
            {service.architectureLinks.map((link, i) => (
              <a
                key={i}
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3 text-sm text-blue-400 transition-colors hover:border-gray-700 hover:bg-gray-900"
              >
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
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                {link}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="mt-8 border-t border-gray-800 pt-6">
        <div className="flex gap-6 text-xs text-gray-500">
          <span>
            생성일: {new Date(service.createdAt).toLocaleDateString("ko-KR")}
          </span>
          <span>
            수정일: {new Date(service.updatedAt).toLocaleDateString("ko-KR")}
          </span>
          <span>ID: {service.serviceId}</span>
        </div>
      </div>

      {/* Edit Modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="서비스 수정"
      >
        <div className="max-h-[70vh] overflow-y-auto">
          <ServiceForm
            initialData={service}
            onSuccess={async () => {
              setEditOpen(false);
              await refreshService();
            }}
          />
        </div>
      </Modal>

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-white">서비스 삭제</h3>
            <p className="mt-2 text-sm text-gray-400">
              &quot;{service.name}&quot;을(를) 삭제합니다. 이 작업은 되돌릴 수
              없습니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg px-4 py-2 text-sm text-gray-400 transition-colors hover:text-white"
              >
                취소
              </button>
              <Button
                variant="danger"
                size="sm"
                loading={deleteLoading}
                onClick={handleDelete}
              >
                삭제
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({
  label,
  value,
  mono,
  href,
}: {
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
}) {
  const content = (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd
        className={`mt-1 text-sm ${mono ? "truncate font-mono text-xs" : ""} ${href ? "text-blue-400" : "text-gray-200"}`}
      >
        {value}
      </dd>
    </div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return content;
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2.5">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-200">{value}</dd>
    </div>
  );
}

function ChevronIcon() {
  return (
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
  );
}
