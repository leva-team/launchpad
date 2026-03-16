"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { CreateSandboxModal } from "./CreateSandboxModal";

interface DashboardHeaderProps {
  count: number;
}

export function DashboardHeader({ count }: DashboardHeaderProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const router = useRouter();

  const handleCreated = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sandboxes</h1>
          <p className="mt-1 text-sm text-gray-400">
            {count === 0
              ? "No sandboxes"
              : `${count} sandbox${count !== 1 ? "es" : ""}`}
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Sandbox
        </Button>
      </div>

      <CreateSandboxModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </>
  );
}
