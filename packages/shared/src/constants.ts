// ─── Platform ──────────────────────────────────────────────

export const PLATFORM_NAME = "Launchpad";
export const BASE_DOMAIN = "adreamer.now";
export const SANDBOX_SUBDOMAIN = "sandbox";
export const SANDBOX_DOMAIN_PATTERN = `*.${SANDBOX_SUBDOMAIN}.${BASE_DOMAIN}`;
export const SERVICE_DOMAIN_PATTERN = `*.${BASE_DOMAIN}`;

// ─── AWS Resources ─────────────────────────────────────────

export const AWS_REGION = "ap-northeast-2";
export const PROJECT_PREFIX = "launchpad";

export const DYNAMO_TABLE_NAME = `${PROJECT_PREFIX}-sandboxes`;
export const COGNITO_USER_POOL_NAME = `${PROJECT_PREFIX}-users`;
export const VPC_NAME = `${PROJECT_PREFIX}-vpc`;

export const ROUTE53_HOSTED_ZONE_NAME = BASE_DOMAIN;

// ─── EC2 Defaults ──────────────────────────────────────────

export const DEFAULT_INSTANCE_TYPE = "c7i.large";
export const ALLOWED_INSTANCE_TYPES = [
  "c7i.large",
  "c7i.xlarge",
] as const;

export const OPENCODE_SERVE_PORT = 3000;
export const CADDY_HTTP_PORT = 80;
export const CADDY_HTTPS_PORT = 443;
export const SSH_PORT = 22;

// ─── IAM ───────────────────────────────────────────────────

export const SANDBOX_ROLE_PREFIX = `${PROJECT_PREFIX}-sandbox-role`;
export const SANDBOX_INSTANCE_PROFILE_PREFIX = `${PROJECT_PREFIX}-sandbox-profile`;

// ─── DynamoDB Keys ─────────────────────────────────────────

export const DDB_KEYS = {
  userPK: (userId: string) => `USER#${userId}`,
  sandboxSK: (sandboxId: string) => `SANDBOX#${sandboxId}`,
  sandboxGSI1PK: (sandboxId: string) => `SANDBOX#${sandboxId}`,
  deploymentSK: (deploymentId: string) => `DEPLOY#${deploymentId}`,
  domainGSI1PK: (domain: string) => `DOMAIN#${domain}`,
} as const;

// ─── Tags ──────────────────────────────────────────────────

export const DEFAULT_TAGS = {
  Project: PLATFORM_NAME,
  ManagedBy: "launchpad",
} as const;

export const sandboxTags = (sandboxId: string, userId: string) => ({
  ...DEFAULT_TAGS,
  SandboxId: sandboxId,
  UserId: userId,
});
