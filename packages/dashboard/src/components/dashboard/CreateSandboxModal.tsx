"use client";

import { useState, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ALLOWED_INSTANCE_TYPES, DEFAULT_INSTANCE_TYPE } from "@launchpad/shared";

interface CreateSandboxModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateSandboxModal({
  open,
  onClose,
  onCreated,
}: CreateSandboxModalProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [instanceType, setInstanceType] = useState(DEFAULT_INSTANCE_TYPE);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function nameToSlug(n: string): string {
    return n.replace(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g, "").replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  }

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slugTouched) setSlug(nameToSlug(val));
  };

  const handleSlugChange = (val: string) => {
    setSlugTouched(true);
    setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  };

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!slug.trim() || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
      setError("ID는 영문 소문자, 숫자, 하이픈만 가능합니다.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/sandboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || undefined,
          instanceType,
          visibility,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create sandbox");
      }

      // Reset form
      setName("");
      setSlug("");
      setSlugTouched(false);
      setDescription("");
      setInstanceType(DEFAULT_INSTANCE_TYPE);
      setVisibility("public");
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sandbox");
    } finally {
      setLoading(false);
    }
  }, [name, slug, description, instanceType, visibility, onCreated, onClose]);

  const handleClose = useCallback(() => {
    if (!loading) {
      setError(null);
      onClose();
    }
  }, [loading, onClose]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create Sandbox"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={loading}>
            Create Sandbox
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <Input
          label="이름"
          placeholder="내 샌드박스"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          hint="표시 이름. 한글 사용 가능."
        />

        <div>
          <Input
            label="ID"
            placeholder="my-sandbox"
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            hint={`도메인: ${slug || "___"}-sandbox.${process.env.NEXT_PUBLIC_SANDBOX_DOMAIN ?? "dev.loiscloud.io"}`}
          />
          {slug && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug) && (
            <p className="mt-1 text-xs text-red-400">영문 소문자, 숫자, 하이픈만 가능합니다.</p>
          )}
        </div>

        <Input
          label="Description"
          placeholder="Development environment for..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
        />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="instance-type"
            className="text-sm font-medium text-gray-300"
          >
            Instance Type
          </label>
          <select
            id="instance-type"
            value={instanceType}
            onChange={(e) => setInstanceType(e.target.value)}
            disabled={loading}
            className="rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-white outline-none transition-colors hover:border-gray-600 focus:border-gray-500 focus:ring-2 focus:ring-white/20"
          >
            {ALLOWED_INSTANCE_TYPES.map((type) => {
              const specs: Record<string, string> = {
                "c7i.large": "2 vCPU / 4 GiB",
                "c7i.xlarge": "4 vCPU / 8 GiB",
              };
              return (
                <option key={type} value={type}>
                  {type} — {specs[type] ?? ""}
                </option>
              );
            })}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-300">공개 범위</label>
          <div className="flex gap-2">
            {(["public", "private"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                disabled={loading}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  visibility === v
                    ? "border-blue-500 bg-blue-600/10 text-blue-400"
                    : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"
                }`}
              >
                {v === "public" ? "공개 — 모든 멤버 접근 가능" : "비공개 — 나만 접근"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
