import type { PipelineStatus } from "@launchpad/shared";

const TRANSITIONS: Record<PipelineStatus, PipelineStatus[]> = {
  created:            ["building"],
  building:           ["deploying_stg", "build_failed"],
  build_failed:       ["building"],
  deploying_stg:      ["stg_active", "stg_failed"],
  stg_failed:         ["deploying_stg", "rolled_back"],
  stg_active:         ["qa_running", "rolled_back"],
  qa_running:         ["pending_approval", "qa_failed"],
  qa_failed:          ["qa_running", "rolled_back"],
  pending_approval:   ["deploying_prd", "rejected", "rolled_back"],
  rejected:           [],
  deploying_prd:      ["ready_for_cutover", "prd_failed"],
  prd_failed:         ["deploying_prd", "rolled_back"],
  ready_for_cutover:  ["live", "rolled_back"],
  live:               ["rolled_back"],
  rolled_back:        [],
};

export function canTransition(from: PipelineStatus, to: PipelineStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function getAvailableActions(status: PipelineStatus): string[] {
  const actionMap: Partial<Record<PipelineStatus, string[]>> = {
    created:           ["build"],
    build_failed:      ["retry_build"],
    stg_active:        ["start_qa", "rollback"],
    qa_failed:         ["retry_qa", "rollback"],
    pending_approval:  ["rollback"],
    ready_for_cutover: ["cutover", "rollback"],
    live:              ["rollback"],
    stg_failed:        ["retry_deploy_stg", "rollback"],
    prd_failed:        ["retry_deploy_prd", "rollback"],
  };
  return actionMap[status] ?? [];
}

export function isTerminal(status: PipelineStatus): boolean {
  return TRANSITIONS[status]?.length === 0;
}

export function isActive(status: PipelineStatus): boolean {
  return ["building", "deploying_stg", "qa_running", "deploying_prd"].includes(status);
}
