"use client";

import type { ProvisioningStep } from "@launchpad/shared";

interface ProvisioningProgressProps {
  steps: ProvisioningStep[];
  errorMessage?: string;
}

function StepIcon({ status }: { status: ProvisioningStep["status"] }) {
  switch (status) {
    case "done":
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 7.5L5.5 10L11 4" />
          </svg>
        </span>
      );
    case "in_progress":
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/20 text-blue-400">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="animate-spin"
          >
            <path d="M7 1a6 6 0 0 1 6 6" />
          </svg>
        </span>
      );
    case "error":
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20 text-red-400">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 4l6 6M10 4l-6 6" />
          </svg>
        </span>
      );
    default:
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-700 bg-gray-800 text-gray-600">
          <span className="h-2 w-2 rounded-full bg-gray-600" />
        </span>
      );
  }
}

export function ProvisioningProgress({
  steps,
  errorMessage,
}: ProvisioningProgressProps) {
  return (
    <div className="rounded-lg bg-gray-900 p-4">
      <div className="space-y-0">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          return (
            <div key={step.id} className="relative flex gap-3">
              {/* Vertical line */}
              {!isLast && (
                <div className="absolute left-3 top-6 h-full w-px bg-gray-800" />
              )}

              {/* Icon */}
              <div className="relative z-10 flex-shrink-0">
                <StepIcon status={step.status} />
              </div>

              {/* Content */}
              <div className={`flex-1 ${isLast ? "pb-0" : "pb-4"}`}>
                <p
                  className={`text-sm font-medium ${
                    step.status === "done"
                      ? "text-gray-300"
                      : step.status === "in_progress"
                        ? "text-white"
                        : step.status === "error"
                          ? "text-red-400"
                          : "text-gray-500"
                  }`}
                >
                  {step.label}
                </p>
                {step.message && (
                  <p className="mt-0.5 text-xs text-gray-500">{step.message}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {errorMessage && (
        <div className="mt-3 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2">
          <p className="text-xs font-medium text-red-400">Error</p>
          <p className="mt-0.5 text-xs text-red-300/80">{errorMessage}</p>
        </div>
      )}
    </div>
  );
}
