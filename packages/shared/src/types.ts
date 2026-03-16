// ─── Sandbox ───────────────────────────────────────────────

export type SandboxStatus =
  | "provisioning"
  | "running"
  | "stopped"
  | "terminated"
  | "error";

export type SandboxVisibility = "public" | "private";

export type ProvisioningStepId =
  | "iam_role"
  | "ec2_launch"
  | "ec2_running"
  | "alb_target"
  | "complete";

export type ProvisioningStepStatus = "pending" | "in_progress" | "done" | "error";

export interface ProvisioningStep {
  id: ProvisioningStepId;
  label: string;
  status: ProvisioningStepStatus;
  message?: string;
  timestamp?: string;
}

export const PROVISIONING_STEPS: readonly ProvisioningStep[] = [
  { id: "iam_role", label: "IAM Role 생성", status: "pending" },
  { id: "ec2_launch", label: "EC2 인스턴스 시작", status: "pending" },
  { id: "ec2_running", label: "인스턴스 부팅 대기", status: "pending" },
  { id: "alb_target", label: "로드밸런서 연결", status: "pending" },
  { id: "complete", label: "준비 완료", status: "pending" },
] as const;

export interface Sandbox {
  sandboxId: string;
  userId: string;
  name: string;
  description: string;
  status: SandboxStatus;

  instanceId: string;
  instanceType: string;
  publicIp: string | null;
  elasticIp: string | null;
  iamRoleArn: string;
  iamInstanceProfileArn: string;
  securityGroupId: string;

  targetGroupArn?: string;
  listenerRuleArn?: string;

  visibility: SandboxVisibility;
  sandboxDomain: string;
  serviceDomains: ServiceDomain[];

  provisioningSteps?: ProvisioningStep[];
  errorMessage?: string;

  region: string;
  amiId: string;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string | null;
}

export interface ServiceDomain {
  serviceName: string;
  domain: string; // {service_name}.adreamer.now
  port: number;
  status: "active" | "inactive";
  createdAt: string;
}

// ─── Sandbox Operations ────────────────────────────────────

export interface CreateSandboxRequest {
  name: string;
  description?: string;
  instanceType?: string;
  visibility?: SandboxVisibility;
}

export interface CreateSandboxResponse {
  sandbox: Sandbox;
}

export interface UpdateSandboxRequest {
  name?: string;
  description?: string;
  action?: "start" | "stop" | "reboot" | "change-instance-type" | "change-visibility";
  instanceType?: string;
  visibility?: SandboxVisibility;
}

export interface ListSandboxesResponse {
  sandboxes: Sandbox[];
  nextToken?: string;
}

// ─── Deployment ────────────────────────────────────────────

export type DeploymentStatus =
  | "building"
  | "deploying"
  | "active"
  | "failed"
  | "rolled_back";

export interface Deployment {
  deploymentId: string;
  sandboxId: string;
  serviceName: string;
  domain: string;
  port: number;
  status: DeploymentStatus;
  buildLog: string;
  createdAt: string;
  completedAt: string | null;
}

export interface DeployRequest {
  serviceName: string;
  projectPath: string;
  port?: number;
}

export interface DeployResponse {
  deployment: Deployment;
  url: string;
}

// ─── User ──────────────────────────────────────────────────

export interface User {
  userId: string;
  email: string;
  name: string;
  cognitoSub: string;
  createdAt: string;
}

// ─── DynamoDB Item shapes ──────────────────────────────────

export interface SandboxDynamoItem {
  PK: string; // USER#{userId}
  SK: string; // SANDBOX#{sandboxId}
  GSI1PK: string; // SANDBOX#{sandboxId}
  GSI1SK: string; // META
  type: "sandbox";
  data: Sandbox;
}

export interface DeploymentDynamoItem {
  PK: string; // SANDBOX#{sandboxId}
  SK: string; // DEPLOY#{deploymentId}
  GSI1PK: string; // DOMAIN#{domain}
  GSI1SK: string; // DEPLOY#{deploymentId}
  type: "deployment";
  data: Deployment;
}
