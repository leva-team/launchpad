"use client";

import { useEffect, useState, useCallback } from "react";
import type { Sandbox } from "@launchpad/shared";
import { SandboxCard } from "./SandboxCard";

const POLL_INTERVAL_MS = 3000;

interface SandboxListProps {
  initialSandboxes: Sandbox[];
  initialShared: Sandbox[];
}

export function SandboxList({ initialSandboxes, initialShared }: SandboxListProps) {
  const [sandboxes, setSandboxes] = useState<Sandbox[]>(initialSandboxes);
  const [shared, setShared] = useState<Sandbox[]>(initialShared);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/sandboxes");
      if (!res.ok) return;
      const data = await res.json();
      setSandboxes(data.sandboxes ?? []);
      setShared(data.shared ?? []);
    } catch { /* ignore */ }
  }, []);

  const all = [...sandboxes, ...shared];
  const hasProvisioning = all.some((s) => s.status === "provisioning");

  useEffect(() => {
    setSandboxes(initialSandboxes);
    setShared(initialShared);
  }, [initialSandboxes, initialShared]);

  useEffect(() => {
    if (!hasProvisioning) return;
    const intervalId = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [hasProvisioning, refresh]);

  const myPrivate = sandboxes.filter((s) => s.visibility !== "public");
  const allPublic = [
    ...sandboxes.filter((s) => s.visibility === "public"),
    ...shared,
  ];

  return (
    <div className="mt-6 space-y-10">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">공개 샌드박스</h2>
        {allPublic.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allPublic.map((sandbox) => (
              <SandboxCard
                key={sandbox.sandboxId}
                sandbox={sandbox}
                onDeleted={refresh}
                readOnly={!sandboxes.some((s) => s.sandboxId === sandbox.sandboxId)}
              />
            ))}
          </div>
        ) : (
          <SectionEmpty
            message="공개된 샌드박스가 없습니다"
            hint="샌드박스를 생성할 때 '공개'로 설정하면 모든 멤버가 접근할 수 있습니다."
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">내 샌드박스</h2>
        {myPrivate.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myPrivate.map((sandbox) => (
              <SandboxCard key={sandbox.sandboxId} sandbox={sandbox} onDeleted={refresh} />
            ))}
          </div>
        ) : (
          <SectionEmpty
            message="비공개 샌드박스가 없습니다"
            hint="상단의 'New Sandbox' 버튼으로 나만 사용할 수 있는 샌드박스를 만들어보세요."
          />
        )}
      </section>
    </div>
  );
}

function SectionEmpty({ message, hint }: { message: string; hint: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-800 py-10">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
      <p className="mt-3 text-sm text-gray-400">{message}</p>
      <p className="mt-1 text-xs text-gray-600">{hint}</p>
    </div>
  );
}
