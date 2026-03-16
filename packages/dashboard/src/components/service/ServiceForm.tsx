"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CreateServiceRequest,
  Service,
  ProjectStage,
  FirewallPolicy,
  DeployStrategy,
} from "@launchpad/shared";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface ServiceFormProps {
  initialData?: Service;
  onSuccess?: () => void;
}

const PROJECT_STAGES: ProjectStage[] = [
  "concept",
  "development",
  "staging",
  "production",
  "deprecated",
];

const FIREWALL_POLICIES: FirewallPolicy[] = [
  "public",
  "internal",
  "restricted",
];

const DEPLOY_STRATEGIES: DeployStrategy[] = [
  "blue-green",
  "canary-10-5",
  "canary-10-15",
  "linear-10-1",
];

const CPU_OPTIONS = [256, 512, 1024, 2048, 4096];
const MEMORY_OPTIONS = [512, 1024, 2048, 4096, 8192];

export function ServiceForm({ initialData, onSuccess }: ServiceFormProps) {
  const router = useRouter();
  const isEdit = !!initialData;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(
    initialData?.description ?? ""
  );
  const [purpose, setPurpose] = useState(initialData?.purpose ?? "");
  const [ownerTeam, setOwnerTeam] = useState(initialData?.ownerTeam ?? "");

  const [projectStage, setProjectStage] = useState<ProjectStage>(
    initialData?.projectStage ?? "concept"
  );
  const [firewallPolicy, setFirewallPolicy] = useState<FirewallPolicy>(
    initialData?.firewallPolicy ?? "public"
  );
  const [repositoryUrl, setRepositoryUrl] = useState(
    initialData?.repositoryUrl ?? ""
  );
  const [dockerfilePath, setDockerfilePath] = useState(
    initialData?.dockerfilePath ?? ""
  );
  const [deployStrategy, setDeployStrategy] = useState<DeployStrategy>(
    initialData?.deployStrategy ?? "blue-green"
  );
  const [slaTarget, setSlaTarget] = useState<string>(
    initialData?.slaTarget?.toString() ?? "99.9"
  );

  const [cpu, setCpu] = useState<number>(initialData?.ecsConfig?.cpu ?? 256);
  const [memory, setMemory] = useState<number>(
    initialData?.ecsConfig?.memory ?? 512
  );
  const [desiredCount, setDesiredCount] = useState<string>(
    initialData?.ecsConfig?.desiredCount?.toString() ?? "1"
  );
  const [port, setPort] = useState<string>(
    initialData?.ecsConfig?.port?.toString() ?? "3000"
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !description.trim() || !purpose.trim() || !ownerTeam.trim()) {
      setError("필수 필드를 모두 입력해주세요.");
      return;
    }

    setLoading(true);

    const body: CreateServiceRequest = {
      name: name.trim(),
      description: description.trim(),
      purpose: purpose.trim(),
      ownerTeam: ownerTeam.trim(),
      projectStage,
      firewallPolicy,
      repositoryUrl: repositoryUrl.trim() || undefined,
      dockerfilePath: dockerfilePath.trim() || undefined,
      deployStrategy,
      slaTarget: parseFloat(slaTarget) || undefined,
      ecsConfig: {
        cpu,
        memory,
        desiredCount: parseInt(desiredCount, 10) || 1,
        port: parseInt(port, 10) || 3000,
      },
    };

    try {
      const url = isEdit
        ? `/api/services/${initialData.serviceId}`
        : "/api/services";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? `요청 실패 (${res.status})`
        );
      }

      const data = await res.json();

      if (onSuccess) {
        onSuccess();
      } else {
        const serviceId =
          (data as { service?: Service }).service?.serviceId ??
          initialData?.serviceId;
        router.push(serviceId ? `/services/${serviceId}` : "/services");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Basic Info */}
      <section>
        <h3 className="mb-4 text-base font-semibold text-white">기본 정보</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-service"
            required
          />
          <Input
            label="Owner Team *"
            value={ownerTeam}
            onChange={(e) => setOwnerTeam(e.target.value)}
            placeholder="platform-team"
            required
          />
          <div className="sm:col-span-2">
            <Input
              label="Purpose *"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="서비스의 목적을 간단히 설명"
              required
            />
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-300">
              Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="서비스에 대한 상세 설명"
              rows={3}
              required
              className="rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition-colors hover:border-gray-600 focus:border-gray-500 focus:ring-2 focus:ring-white/20"
            />
          </div>
        </div>
      </section>

      {/* Configuration */}
      <section>
        <h3 className="mb-4 text-base font-semibold text-white">설정</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="Project Stage"
            value={projectStage}
            onChange={(v) => setProjectStage(v as ProjectStage)}
            options={PROJECT_STAGES.map((s) => ({ value: s, label: s }))}
          />
          <SelectField
            label="Firewall Policy"
            value={firewallPolicy}
            onChange={(v) => setFirewallPolicy(v as FirewallPolicy)}
            options={FIREWALL_POLICIES.map((p) => ({ value: p, label: p }))}
          />
          <SelectField
            label="Deploy Strategy"
            value={deployStrategy}
            onChange={(v) => setDeployStrategy(v as DeployStrategy)}
            options={DEPLOY_STRATEGIES.map((d) => ({ value: d, label: d }))}
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Input
            label="SLA Target (%)"
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={slaTarget}
            onChange={(e) => setSlaTarget(e.target.value)}
            placeholder="99.9"
          />
          <Input
            label="Repository URL"
            value={repositoryUrl}
            onChange={(e) => setRepositoryUrl(e.target.value)}
            placeholder="https://github.com/org/repo"
          />
          <Input
            label="Dockerfile Path"
            value={dockerfilePath}
            onChange={(e) => setDockerfilePath(e.target.value)}
            placeholder="Dockerfile"
          />
        </div>
      </section>

      {/* ECS Config */}
      <section>
        <h3 className="mb-4 text-base font-semibold text-white">
          ECS Configuration
        </h3>
        <div className="grid gap-4 sm:grid-cols-4">
          <SelectField
            label="CPU"
            value={cpu.toString()}
            onChange={(v) => setCpu(parseInt(v, 10))}
            options={CPU_OPTIONS.map((c) => ({
              value: c.toString(),
              label: `${c} units`,
            }))}
          />
          <SelectField
            label="Memory"
            value={memory.toString()}
            onChange={(v) => setMemory(parseInt(v, 10))}
            options={MEMORY_OPTIONS.map((m) => ({
              value: m.toString(),
              label: `${m} MB`,
            }))}
          />
          <Input
            label="Desired Count"
            type="number"
            min="0"
            value={desiredCount}
            onChange={(e) => setDesiredCount(e.target.value)}
            placeholder="1"
          />
          <Input
            label="Port"
            type="number"
            min="1"
            max="65535"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="3000"
          />
        </div>
      </section>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-gray-800 pt-6">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={loading}
        >
          취소
        </Button>
        <Button type="submit" loading={loading}>
          {isEdit ? "수정" : "서비스 생성"}
        </Button>
      </div>
    </form>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-white outline-none transition-colors hover:border-gray-600 focus:border-gray-500 focus:ring-2 focus:ring-white/20"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
