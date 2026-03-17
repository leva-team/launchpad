/**
 * 샌드박스 프로비저닝 — 비동기 패턴
 *
 * 핵심 플로우:
 * 1. DDB에 status: "provisioning"으로 즉시 저장 → API 즉시 응답
 * 2. 백그라운드 프로비저닝:
 *    a. IAM Role + InstanceProfile 생성
 *    b. EC2 RunInstances (private subnet, LaunchTemplate 기반)
 *    c. Running 대기
 *    d. ELBv2 TargetGroup 생성 → RegisterTargets → Listener Rule 생성
 *    e. DDB 상태를 "running"으로 업데이트
 * 3. 에러 시 생성된 리소스 정리 + DDB "error" 상태
 */

import {
  RunInstancesCommand,
  waitUntilInstanceRunning,
  TerminateInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  RebootInstancesCommand,
  DescribeInstancesCommand,
  type _InstanceType,
} from "@aws-sdk/client-ec2";
import {
  CreateRoleCommand,
  DeleteRoleCommand,
  AttachRolePolicyCommand,
  DetachRolePolicyCommand,
  CreateInstanceProfileCommand,
  DeleteInstanceProfileCommand,
  AddRoleToInstanceProfileCommand,
  RemoveRoleFromInstanceProfileCommand,
  waitUntilRoleExists,
  waitUntilInstanceProfileExists,
} from "@aws-sdk/client-iam";
import {
  CreateTargetGroupCommand,
  RegisterTargetsCommand,
  CreateRuleCommand,
  DeleteTargetGroupCommand,
  DeregisterTargetsCommand,
  DeleteRuleCommand,
  DescribeRulesCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import { GetParameterCommand } from "@aws-sdk/client-ssm";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { Route53Client, ChangeResourceRecordSetsCommand } from "@aws-sdk/client-route-53";
import { PutCommand, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

import {
  UpdateUserPoolClientCommand,
  DescribeUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { ec2Client, iamClient, ssmClient, docClient, elbv2Client, cognitoClient } from "./clients";
import type { Sandbox, CreateSandboxRequest, ProvisioningStep, ProvisioningStepId } from "@launchpad/shared";
import {
  PROJECT_PREFIX,
  SANDBOX_ROLE_PREFIX,
  SANDBOX_INSTANCE_PROFILE_PREFIX,
  BASE_DOMAIN,

  DDB_KEYS,
  DEFAULT_INSTANCE_TYPE,
  PROVISIONING_STEPS,
  sandboxTags,
} from "@launchpad/shared";
import { nanoid } from "nanoid";

// ─── Configuration ─────────────────────────────────────────

const config = {
  launchTemplateId: process.env.LAUNCH_TEMPLATE_ID!,
  securityGroupId: process.env.SANDBOX_SECURITY_GROUP_ID!,
  subnetIds: (process.env.SANDBOX_SUBNET_IDS ?? "").split(","),
  tableName: process.env.DYNAMO_TABLE_NAME ?? "launchpad-sandboxes",
  amiParameterName: process.env.SANDBOX_AMI_PARAMETER ?? `/${PROJECT_PREFIX}/sandbox/ami-id`,
  region: process.env.AWS_REGION ?? "ap-northeast-2",
  albListenerArn: process.env.ALB_LISTENER_ARN!,
  vpcId: process.env.VPC_ID!,
  cognitoUserPoolArn: process.env.COGNITO_USER_POOL_ARN!,
  cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID!,
  cognitoClientId: process.env.COGNITO_CLIENT_ID!,
  cognitoDomain: process.env.COGNITO_DOMAIN ?? "launchpad.auth.ap-northeast-2.amazoncognito.com",
  cognitoAlbClientId: process.env.COGNITO_ALB_CLIENT_ID!,
  dnsRoleArn: process.env.DNS_ROLE_ARN,
  dnsHostedZoneId: process.env.DNS_HOSTED_ZONE_ID,
  albDnsName: process.env.ALB_DNS_NAME,
  sandboxBaseDomain: process.env.SANDBOX_BASE_DOMAIN,
};

// ─── DNS (cross-account Route53) ───────────────────────────

async function getRoute53Client(): Promise<Route53Client | null> {
  if (!config.dnsHostedZoneId) return null;

  if (!config.dnsRoleArn) {
    return new Route53Client({ region: "us-east-1" });
  }

  const sts = new STSClient({ region: config.region });
  const { Credentials } = await sts.send(
    new AssumeRoleCommand({
      RoleArn: config.dnsRoleArn,
      RoleSessionName: "launchpad-dns",
      DurationSeconds: 900,
    })
  );
  if (!Credentials) return null;

  return new Route53Client({
    region: "us-east-1",
    credentials: {
      accessKeyId: Credentials.AccessKeyId!,
      secretAccessKey: Credentials.SecretAccessKey!,
      sessionToken: Credentials.SessionToken!,
    },
  });
}

async function registerSandboxDns(sandboxDomain: string) {
  const r53 = await getRoute53Client();
  if (!r53 || !config.albDnsName) return;

  await r53.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: config.dnsHostedZoneId,
      ChangeBatch: {
        Changes: [{
          Action: "UPSERT",
          ResourceRecordSet: {
            Name: sandboxDomain,
            Type: "CNAME",
            TTL: 60,
            ResourceRecords: [{ Value: config.albDnsName }],
          },
        }],
      },
    })
  );
}

async function deregisterSandboxDns(sandboxDomain: string) {
  const r53 = await getRoute53Client();
  if (!r53 || !config.albDnsName) return;

  await r53.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: config.dnsHostedZoneId,
      ChangeBatch: {
        Changes: [{
          Action: "DELETE",
          ResourceRecordSet: {
            Name: sandboxDomain,
            Type: "CNAME",
            TTL: 60,
            ResourceRecords: [{ Value: config.albDnsName }],
          },
        }],
      },
    })
  ).catch(() => {});
}

// ─── Helpers ───────────────────────────────────────────────

async function waitForSoftwareInit(instanceId: string, maxWaitMs = 420000): Promise<void> {
  const { SendCommandCommand, GetCommandInvocationCommand } = await import("@aws-sdk/client-ssm");
  const startTime = Date.now();
  const pollInterval = 15000;

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollInterval));

    try {
      const { Command } = await ssmClient.send(
        new SendCommandCommand({
          InstanceIds: [instanceId],
          DocumentName: "AWS-RunShellScript",
          Parameters: { commands: ["cat /var/log/launchpad-init.log 2>/dev/null || echo NOT_READY"] },
          TimeoutSeconds: 30,
        })
      );
      if (!Command?.CommandId) continue;

      await new Promise((r) => setTimeout(r, 8000));

      const { StandardOutputContent, Status } = await ssmClient.send(
        new GetCommandInvocationCommand({
          CommandId: Command.CommandId,
          InstanceId: instanceId,
        })
      );

      if (Status === "Success" && StandardOutputContent?.includes("Launchpad sandbox ready")) {
        return;
      }
    } catch {
      continue;
    }
  }
  console.warn(`Software init timeout for ${instanceId} after ${maxWaitMs}ms — proceeding anyway`);
}

function pickSubnet(): string {
  const idx = Math.floor(Math.random() * config.subnetIds.length);
  return config.subnetIds[idx];
}

async function retry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries: number; delay: number; shouldRetry?: (err: unknown) => boolean }
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < opts.maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (opts.shouldRetry && !opts.shouldRetry(err)) throw err;
      await new Promise((r) => setTimeout(r, opts.delay));
    }
  }
  throw lastError;
}

function isInstanceProfileNotFoundError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "InvalidParameterValue" ||
      err.message.includes("Invalid IAM Instance Profile"))
  );
}

async function getCustomAmiId(): Promise<string | undefined> {
  try {
    const { Parameter } = await ssmClient.send(
      new GetParameterCommand({ Name: config.amiParameterName })
    );
    const value = Parameter?.Value;
    if (value && value !== "PLACEHOLDER_AMI_ID") return value;
  } catch {
    // SSM parameter not found — fall through to LaunchTemplate default
  }
  return undefined;
}

async function getNextRulePriority(): Promise<number> {
  const { Rules } = await elbv2Client.send(
    new DescribeRulesCommand({ ListenerArn: config.albListenerArn })
  );

  const priorities = (Rules ?? [])
    .map((r) => r.Priority)
    .filter((p): p is string => p !== undefined && p !== "default")
    .map(Number)
    .filter((n) => !isNaN(n));

  return priorities.length === 0 ? 1 : Math.max(...priorities) + 1;
}

// ─── IAM Provisioning ──────────────────────────────────────

async function createSandboxIamRole(sandboxId: string, userId: string) {
  const roleName = `${SANDBOX_ROLE_PREFIX}-${sandboxId}`;
  const profileName = `${SANDBOX_INSTANCE_PROFILE_PREFIX}-${sandboxId}`;

  await iamClient.send(
    new CreateRoleCommand({
      RoleName: roleName,
      Path: `/sandbox/`,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "ec2.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      }),
      Tags: [
        { Key: "SandboxId", Value: sandboxId },
        { Key: "UserId", Value: userId },
        { Key: "Project", Value: "Launchpad" },
      ],
    })
  );

  await waitUntilRoleExists(
    { client: iamClient, maxWaitTime: 60 },
    { RoleName: roleName }
  );

  const basePolicies = [
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
    "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
  ];

  for (const policyArn of basePolicies) {
    await iamClient.send(
      new AttachRolePolicyCommand({ RoleName: roleName, PolicyArn: policyArn })
    );
  }

  await iamClient.send(
    new CreateInstanceProfileCommand({
      InstanceProfileName: profileName,
      Path: "/sandbox/",
    })
  );

  await waitUntilInstanceProfileExists(
    { client: iamClient, maxWaitTime: 60 },
    { InstanceProfileName: profileName }
  );

  await iamClient.send(
    new AddRoleToInstanceProfileCommand({
      InstanceProfileName: profileName,
      RoleName: roleName,
    })
  );

  // IAM 전파를 위한 추가 대기
  await new Promise((r) => setTimeout(r, 5000));

  return { roleName, profileName };
}

async function deleteSandboxIamRole(sandboxId: string) {
  const roleName = `${SANDBOX_ROLE_PREFIX}-${sandboxId}`;
  const profileName = `${SANDBOX_INSTANCE_PROFILE_PREFIX}-${sandboxId}`;

  try {
    const basePolicies = [
      "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
      "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
    ];
    for (const policyArn of basePolicies) {
      await iamClient
        .send(new DetachRolePolicyCommand({ RoleName: roleName, PolicyArn: policyArn }))
        .catch(() => {});
    }

    await iamClient
      .send(
        new RemoveRoleFromInstanceProfileCommand({
          InstanceProfileName: profileName,
          RoleName: roleName,
        })
      )
      .catch(() => {});

    await iamClient
      .send(new DeleteInstanceProfileCommand({ InstanceProfileName: profileName }))
      .catch(() => {});

    await iamClient.send(new DeleteRoleCommand({ RoleName: roleName })).catch(() => {});
  } catch (err) {
    console.error(`Failed to cleanup IAM for sandbox ${sandboxId}:`, err);
  }
}

// ─── EC2 Provisioning ──────────────────────────────────────

async function launchSandboxInstance(
  sandboxId: string,
  userId: string,
  profileName: string,
  instanceType: string,
  sandboxName: string
): Promise<string> {
  const customAmiId = await getCustomAmiId();
  const tags = sandboxTags(sandboxId, userId);

  const { Instances } = await retry(
    () =>
      ec2Client.send(
        new RunInstancesCommand({
          LaunchTemplate: {
            LaunchTemplateId: config.launchTemplateId,
            Version: "$Latest",
          },
          ...(customAmiId ? { ImageId: customAmiId } : {}),
          InstanceType: instanceType as _InstanceType,
          MinCount: 1,
          MaxCount: 1,
          SubnetId: pickSubnet(),
          IamInstanceProfile: {
            Arn: `arn:aws:iam::${process.env.AWS_ACCOUNT_ID}:instance-profile/sandbox/${profileName}`,
          },
          TagSpecifications: [
            {
              ResourceType: "instance",
              Tags: [
                ...Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
                { Key: "Name", Value: `${PROJECT_PREFIX}-${sandboxName}` },
                { Key: "SandboxName", Value: sandboxName },
              ],
            },
            {
              ResourceType: "volume",
              Tags: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
            },
          ],
        })
      ),
    { maxRetries: 10, delay: 3000, shouldRetry: isInstanceProfileNotFoundError }
  );

  const instanceId = Instances?.[0]?.InstanceId;
  if (!instanceId) throw new Error("EC2 instance creation failed — no instanceId returned");

  await waitUntilInstanceRunning(
    { client: ec2Client, maxWaitTime: 300 },
    { InstanceIds: [instanceId] }
  );

  return instanceId;
}

// ─── ALB Target Group / Rule ───────────────────────────────

async function createTargetGroupAndRule(
  sandboxId: string,
  sandboxName: string,
  instanceId: string
): Promise<{ targetGroupArn: string; listenerRuleArn: string }> {
  const tgName = `lp-${sandboxId.slice(0, 8).replace(/[^A-Za-z0-9-]/g, "x")}`;

  const { TargetGroups } = await elbv2Client.send(
    new CreateTargetGroupCommand({
      Name: tgName,
      Protocol: "HTTP",
      Port: 80,
      VpcId: config.vpcId,
      TargetType: "instance",
      HealthCheckEnabled: true,
      HealthCheckPath: "/",
      HealthCheckProtocol: "HTTP",
    })
  );

  const targetGroupArn = TargetGroups?.[0]?.TargetGroupArn;
  if (!targetGroupArn) throw new Error("Failed to create TargetGroup");

  await elbv2Client.send(
    new RegisterTargetsCommand({
      TargetGroupArn: targetGroupArn,
      Targets: [{ Id: instanceId, Port: 80 }],
    })
  );

  const priority = await getNextRulePriority();
  const baseDomain = process.env.SANDBOX_BASE_DOMAIN ?? BASE_DOMAIN;
  const hostHeader = `${sandboxName}-sandbox.${baseDomain}`;

  const callbackUrl = `https://${hostHeader}/oauth2/idpresponse`;
  await addCognitoCallbackUrl(callbackUrl);

  const { Rules } = await elbv2Client.send(
    new CreateRuleCommand({
      ListenerArn: config.albListenerArn,
      Priority: priority,
      Conditions: [
        {
          Field: "host-header",
          Values: [hostHeader],
        },
      ],
      Actions: [
        {
          Type: "authenticate-cognito",
          Order: 1,
          AuthenticateCognitoConfig: {
            UserPoolArn: config.cognitoUserPoolArn,
            UserPoolClientId: config.cognitoAlbClientId,
            UserPoolDomain: config.cognitoDomain.replace(".auth.ap-northeast-2.amazoncognito.com", ""),
            OnUnauthenticatedRequest: "authenticate",
            SessionCookieName: "AWSELBAuthSessionCookie",
            SessionTimeout: 86400,
          },
        },
        {
          Type: "forward",
          Order: 2,
          TargetGroupArn: targetGroupArn,
        },
      ],
    })
  );

  const listenerRuleArn = Rules?.[0]?.RuleArn;
  if (!listenerRuleArn) throw new Error("Failed to create Listener Rule");

  return { targetGroupArn, listenerRuleArn };
}

async function deleteTargetGroupAndRule(
  targetGroupArn?: string,
  listenerRuleArn?: string,
  instanceId?: string
) {
  try {
    if (listenerRuleArn) {
      await elbv2Client
        .send(new DeleteRuleCommand({ RuleArn: listenerRuleArn }))
        .catch(() => {});
    }

    if (targetGroupArn && instanceId) {
      await elbv2Client
        .send(
          new DeregisterTargetsCommand({
            TargetGroupArn: targetGroupArn,
            Targets: [{ Id: instanceId }],
          })
        )
        .catch(() => {});
    }

    if (targetGroupArn) {
      await elbv2Client
        .send(new DeleteTargetGroupCommand({ TargetGroupArn: targetGroupArn }))
        .catch(() => {});
    }
  } catch (err) {
    console.error("Failed to cleanup ALB resources:", err);
  }
}

// ─── Cognito Callback URL Management ───────────────────────

async function getCognitoAlbClientConfig() {
  const { UserPoolClient } = await cognitoClient.send(
    new DescribeUserPoolClientCommand({
      UserPoolId: config.cognitoUserPoolId,
      ClientId: config.cognitoAlbClientId,
    })
  );
  return UserPoolClient;
}

async function addCognitoCallbackUrl(callbackUrl: string) {
  const client = await getCognitoAlbClientConfig();
  if (!client) return;

  const currentCallbacks = client.CallbackURLs ?? [];
  const currentLogouts = client.LogoutURLs ?? [];
  if (currentCallbacks.includes(callbackUrl)) return;

  await cognitoClient.send(
    new UpdateUserPoolClientCommand({
      UserPoolId: config.cognitoUserPoolId,
      ClientId: config.cognitoAlbClientId,
      CallbackURLs: [...currentCallbacks, callbackUrl],
      LogoutURLs: currentLogouts,
      SupportedIdentityProviders: client.SupportedIdentityProviders,
      AllowedOAuthFlows: client.AllowedOAuthFlows,
      AllowedOAuthScopes: client.AllowedOAuthScopes,
      AllowedOAuthFlowsUserPoolClient: client.AllowedOAuthFlowsUserPoolClient,
      ExplicitAuthFlows: client.ExplicitAuthFlows,
      PreventUserExistenceErrors: client.PreventUserExistenceErrors,
    })
  );
}

async function removeCognitoCallbackUrl(callbackUrl: string) {
  const client = await getCognitoAlbClientConfig();
  if (!client) return;

  const currentCallbacks = (client.CallbackURLs ?? []).filter((u) => u !== callbackUrl);
  const currentLogouts = client.LogoutURLs ?? [];

  await cognitoClient.send(
    new UpdateUserPoolClientCommand({
      UserPoolId: config.cognitoUserPoolId,
      ClientId: config.cognitoAlbClientId,
      CallbackURLs: currentCallbacks,
      LogoutURLs: currentLogouts,
      SupportedIdentityProviders: client.SupportedIdentityProviders,
      AllowedOAuthFlows: client.AllowedOAuthFlows,
      AllowedOAuthScopes: client.AllowedOAuthScopes,
      AllowedOAuthFlowsUserPoolClient: client.AllowedOAuthFlowsUserPoolClient,
      ExplicitAuthFlows: client.ExplicitAuthFlows,
      PreventUserExistenceErrors: client.PreventUserExistenceErrors,
    })
  );
}

// ─── DynamoDB Operations ───────────────────────────────────

async function saveSandbox(sandbox: Sandbox) {
  await docClient.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: DDB_KEYS.userPK(sandbox.userId),
        SK: DDB_KEYS.sandboxSK(sandbox.sandboxId),
        GSI1PK: sandbox.visibility === "public" ? "VISIBILITY#public" : DDB_KEYS.sandboxGSI1PK(sandbox.sandboxId),
        GSI1SK: DDB_KEYS.sandboxSK(sandbox.sandboxId),
        type: "sandbox",
        data: sandbox,
      },
    })
  );
}

async function updateSandboxStatus(
  userId: string,
  sandboxId: string,
  updates: Partial<Sandbox>
) {
  const current = await getSandbox(userId, sandboxId);
  if (current) {
    const merged = { ...current, ...updates, updatedAt: new Date().toISOString() };
    if (updates.errorMessage === undefined && "errorMessage" in updates) delete merged.errorMessage;
    if (updates.provisioningSteps === undefined && "provisioningSteps" in updates) delete merged.provisioningSteps;
    await saveSandbox(merged);
  }
}

async function updateStep(
  userId: string,
  sandboxId: string,
  stepId: ProvisioningStepId,
  status: ProvisioningStep["status"],
  message?: string
) {
  const current = await getSandbox(userId, sandboxId);
  if (!current) return;

  const steps: ProvisioningStep[] = current.provisioningSteps
    ? [...current.provisioningSteps]
    : PROVISIONING_STEPS.map((s) => ({ ...s }));

  const idx = steps.findIndex((s) => s.id === stepId);
  if (idx >= 0) {
    steps[idx] = {
      ...steps[idx],
      status,
      message,
      timestamp: new Date().toISOString(),
    };
  }

  const updates: Partial<Sandbox> = { provisioningSteps: steps };
  if (status === "error") {
    updates.status = "error";
    updates.errorMessage = message;
  }

  await updateSandboxStatus(userId, sandboxId, updates);
}

export async function getSandbox(
  userId: string,
  sandboxId: string
): Promise<Sandbox | null> {
  const { Item } = await docClient.send(
    new GetCommand({
      TableName: config.tableName,
      Key: {
        PK: DDB_KEYS.userPK(userId),
        SK: DDB_KEYS.sandboxSK(sandboxId),
      },
    })
  );
  return (Item?.data as Sandbox) ?? null;
}

export async function getSandboxByIdPublic(sandboxId: string): Promise<Sandbox | null> {
  const { Items } = await docClient.send(
    new QueryCommand({
      TableName: config.tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :gsi1pk AND GSI1SK = :gsi1sk",
      ExpressionAttributeValues: {
        ":gsi1pk": "VISIBILITY#public",
        ":gsi1sk": DDB_KEYS.sandboxSK(sandboxId),
      },
    })
  );
  return (Items?.[0]?.data as Sandbox) ?? null;
}

export async function listUserSandboxes(userId: string): Promise<{ mine: Sandbox[]; shared: Sandbox[] }> {
  const [myResult, publicResult] = await Promise.all([
    docClient.send(
      new QueryCommand({
        TableName: config.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": DDB_KEYS.userPK(userId),
          ":skPrefix": "SANDBOX#",
        },
      })
    ),
    docClient.send(
      new QueryCommand({
        TableName: config.tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :gsi1pk",
        ExpressionAttributeValues: {
          ":gsi1pk": "VISIBILITY#public",
        },
      })
    ),
  ]);

  const mine = (myResult.Items ?? [])
    .map((item) => item.data as Sandbox)
    .filter((s) => s.status !== "terminated");

  const shared = (publicResult.Items ?? [])
    .map((item) => item.data as Sandbox)
    .filter((s) => s.status !== "terminated" && s.userId !== userId);

  return { mine, shared };
}

// ─── Background Provisioning ───────────────────────────────

async function provisionSandboxBackground(sandbox: Sandbox) {
  const { sandboxId, userId, slug: sandboxName, instanceType } = sandbox;
  let roleName: string | undefined;
  let instanceId: string | undefined;
  let targetGroupArn: string | undefined;
  let listenerRuleArn: string | undefined;

  try {
    await updateStep(userId, sandboxId, "iam_role", "in_progress", "IAM Role 및 Instance Profile 생성 중...");
    const iam = await createSandboxIamRole(sandboxId, userId);
    roleName = iam.roleName;
    await updateStep(userId, sandboxId, "iam_role", "done", `Role: ${roleName}`);

    await updateStep(userId, sandboxId, "ec2_launch", "in_progress", "EC2 인스턴스를 시작합니다...");
    instanceId = await launchSandboxInstance(
      sandboxId,
      userId,
      iam.profileName,
      instanceType,
      sandboxName
    );
    await updateStep(userId, sandboxId, "ec2_launch", "done", `Instance: ${instanceId}`);

    await updateStep(userId, sandboxId, "ec2_running", "in_progress", "인스턴스 부팅 대기 중...");
    await updateStep(userId, sandboxId, "ec2_running", "done", "인스턴스 Running 상태 확인");

    await updateStep(userId, sandboxId, "software_init", "in_progress", "Node.js, OpenCode, OMO 설치 중... (2~5분 소요)");
    await waitForSoftwareInit(instanceId);
    await updateStep(userId, sandboxId, "software_init", "done", "OpenCode + OMO 설치 완료");

    await updateStep(userId, sandboxId, "alb_target", "in_progress", "ALB 타겟 그룹 및 라우팅 규칙 생성 중...");
    const albResult = await createTargetGroupAndRule(sandboxId, sandboxName, instanceId);
    targetGroupArn = albResult.targetGroupArn;
    listenerRuleArn = albResult.listenerRuleArn;
    const sandboxDomain = `${sandboxName}-sandbox.${config.sandboxBaseDomain ?? BASE_DOMAIN}`;
    await registerSandboxDns(sandboxDomain).catch((err) =>
      console.error("DNS registration failed (non-fatal):", err)
    );
    await updateStep(userId, sandboxId, "alb_target", "done", `도메인: ${sandboxDomain}`);

    await updateStep(userId, sandboxId, "complete", "done", "샌드박스가 준비되었습니다");

    await updateSandboxStatus(userId, sandboxId, {
      status: "running",
      instanceId,
      iamRoleArn: `arn:aws:iam::*:role/sandbox/${roleName}`,
      iamInstanceProfileArn: `arn:aws:iam::*:instance-profile/sandbox/${iam.profileName}`,
      targetGroupArn,
      listenerRuleArn,
      amiId: (await getCustomAmiId()) ?? "launch-template-default",
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Background provisioning failed for sandbox ${sandboxId}:`, err);

    const current = await getSandbox(userId, sandboxId);
    const currentStepId = current?.provisioningSteps?.find((s) => s.status === "in_progress")?.id;
    if (currentStepId) {
      await updateStep(userId, sandboxId, currentStepId, "error", errorMsg);
    } else {
      await updateSandboxStatus(userId, sandboxId, {
        status: "error",
        errorMessage: errorMsg,
      });
    }

    if (targetGroupArn || listenerRuleArn) {
      await deleteTargetGroupAndRule(targetGroupArn, listenerRuleArn, instanceId);
    }
    if (instanceId) {
      await ec2Client
        .send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }))
        .catch(() => {});
    }
    if (roleName) {
      await deleteSandboxIamRole(sandboxId);
    }
  }
}

// ─── Public API ────────────────────────────────────────────

export async function createSandbox(
  userId: string,
  req: CreateSandboxRequest
): Promise<Sandbox> {
  const sandboxId = nanoid(12);
  const slug = req.slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const instanceType = req.instanceType ?? DEFAULT_INSTANCE_TYPE;
  const now = new Date().toISOString();

  const sandbox: Sandbox = {
    sandboxId,
    userId,
    name: req.name,
    slug,
    description: req.description ?? "",
    status: "provisioning",
    instanceId: "",
    instanceType,
    publicIp: null,
    elasticIp: null,
    iamRoleArn: "",
    iamInstanceProfileArn: "",
    securityGroupId: config.securityGroupId,
    targetGroupArn: undefined,
    listenerRuleArn: undefined,
    visibility: req.visibility ?? "public",
    sandboxDomain: `${slug}-sandbox.${process.env.SANDBOX_BASE_DOMAIN ?? BASE_DOMAIN}`,
    serviceDomains: [],
    provisioningSteps: PROVISIONING_STEPS.map((s) => ({ ...s })),
    region: config.region,
    amiId: "",
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: null,
  };

  await saveSandbox(sandbox);

  // Fire-and-forget: 백그라운드 프로비저닝
  provisionSandboxBackground(sandbox).catch((err) => {
    console.error(`Unhandled error in provisionSandboxBackground for ${sandboxId}:`, err);
  });

  return sandbox;
}

export async function terminateSandbox(
  userId: string,
  sandboxId: string
): Promise<void> {
  const sandbox = await getSandbox(userId, sandboxId);
  if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

  // 1. Terminate EC2
  if (sandbox.instanceId) {
    await ec2Client.send(
      new TerminateInstancesCommand({ InstanceIds: [sandbox.instanceId] })
    );
  }

  // 2. Cleanup ALB resources
  await deleteTargetGroupAndRule(
    sandbox.targetGroupArn,
    sandbox.listenerRuleArn,
    sandbox.instanceId
  );

  // 3. Cleanup IAM
  await deleteSandboxIamRole(sandboxId);

  await deregisterSandboxDns(sandbox.sandboxDomain).catch(() => {});

  await updateSandboxStatus(userId, sandboxId, { status: "terminated" });
}

export async function controlSandbox(
  userId: string,
  sandboxId: string,
  action: "start" | "stop" | "reboot"
): Promise<Sandbox> {
  const sandbox = await getSandbox(userId, sandboxId);
  if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

  const clearFields = { errorMessage: undefined, provisioningSteps: undefined };

  switch (action) {
    case "start":
      await updateSandboxStatus(userId, sandboxId, { ...clearFields, status: "provisioning" });
      await ec2Client.send(
        new StartInstancesCommand({ InstanceIds: [sandbox.instanceId] })
      );
      await waitUntilInstanceRunning(
        { client: ec2Client, maxWaitTime: 300 },
        { InstanceIds: [sandbox.instanceId] }
      );
      await updateSandboxStatus(userId, sandboxId, { status: "running" });
      break;

    case "stop":
      await updateSandboxStatus(userId, sandboxId, clearFields);
      await ec2Client.send(
        new StopInstancesCommand({ InstanceIds: [sandbox.instanceId] })
      );
      await updateSandboxStatus(userId, sandboxId, { status: "stopped" });
      break;

    case "reboot":
      await updateSandboxStatus(userId, sandboxId, clearFields);
      await ec2Client.send(
        new RebootInstancesCommand({ InstanceIds: [sandbox.instanceId] })
      );
      break;
  }

  return (await getSandbox(userId, sandboxId))!;
}

export async function changeSlug(
  userId: string,
  sandboxId: string,
  newSlug: string
): Promise<Sandbox> {
  const sandbox = await getSandbox(userId, sandboxId);
  if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

  const cleanSlug = newSlug.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const baseDomain = config.sandboxBaseDomain ?? BASE_DOMAIN;
  const oldDomain = sandbox.sandboxDomain;
  const newDomain = `${cleanSlug}-sandbox.${baseDomain}`;

  if (sandbox.listenerRuleArn) {
    const { ModifyRuleCommand } = await import("@aws-sdk/client-elastic-load-balancing-v2");
    await elbv2Client.send(
      new ModifyRuleCommand({
        RuleArn: sandbox.listenerRuleArn,
        Conditions: [{ Field: "host-header", Values: [newDomain] }],
      })
    );
  }

  if (oldDomain !== newDomain) {
    await deregisterSandboxDns(oldDomain).catch(() => {});
    await registerSandboxDns(newDomain).catch(() => {});
  }

  await updateSandboxStatus(userId, sandboxId, {
    slug: cleanSlug,
    sandboxDomain: newDomain,
  });

  return (await getSandbox(userId, sandboxId))!;
}

export async function changeVisibility(
  userId: string,
  sandboxId: string,
  visibility: "public" | "private"
): Promise<Sandbox> {
  const sandbox = await getSandbox(userId, sandboxId);
  if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

  await updateSandboxStatus(userId, sandboxId, { visibility });
  return (await getSandbox(userId, sandboxId))!;
}

export async function changeInstanceType(
  userId: string,
  sandboxId: string,
  newInstanceType: string
): Promise<Sandbox> {
  const sandbox = await getSandbox(userId, sandboxId);
  if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

  const {
    ModifyInstanceAttributeCommand,
    waitUntilInstanceStopped,
  } = await import("@aws-sdk/client-ec2");

  try {
    await updateSandboxStatus(userId, sandboxId, {
      status: "provisioning",
      errorMessage: undefined,
      provisioningSteps: [
        { id: "iam_role" as const, label: "인스턴스 중지", status: "in_progress", message: "안전하게 중지 중...", timestamp: new Date().toISOString() },
        { id: "ec2_launch" as const, label: "타입 변경", status: "pending" },
        { id: "ec2_running" as const, label: "인스턴스 시작", status: "pending" },
        { id: "complete" as const, label: "완료", status: "pending" },
      ],
    });

    await ec2Client.send(
      new ModifyInstanceAttributeCommand({
        InstanceId: sandbox.instanceId,
        InstanceInitiatedShutdownBehavior: { Value: "stop" },
      })
    );

    if (sandbox.status === "running") {
      await ec2Client.send(new StopInstancesCommand({ InstanceIds: [sandbox.instanceId] }));
      await waitUntilInstanceStopped(
        { client: ec2Client, maxWaitTime: 180 },
        { InstanceIds: [sandbox.instanceId] }
      );
    }

    const describeResult = await ec2Client.send(
      new DescribeInstancesCommand({ InstanceIds: [sandbox.instanceId] })
    );
    const state = describeResult.Reservations?.[0]?.Instances?.[0]?.State?.Name;
    if (state !== "stopped") {
      throw new Error(`Instance is ${state}, expected stopped.`);
    }

    await updateSandboxStatus(userId, sandboxId, {
      provisioningSteps: [
        { id: "iam_role" as const, label: "인스턴스 중지", status: "done", message: "중지 완료", timestamp: new Date().toISOString() },
        { id: "ec2_launch" as const, label: "타입 변경", status: "in_progress", message: `${sandbox.instanceType} → ${newInstanceType}`, timestamp: new Date().toISOString() },
        { id: "ec2_running" as const, label: "인스턴스 시작", status: "pending" },
        { id: "complete" as const, label: "완료", status: "pending" },
      ],
    });

    await ec2Client.send(
      new ModifyInstanceAttributeCommand({
        InstanceId: sandbox.instanceId,
        InstanceType: { Value: newInstanceType },
      })
    );

    await updateSandboxStatus(userId, sandboxId, {
      provisioningSteps: [
        { id: "iam_role" as const, label: "인스턴스 중지", status: "done", message: "중지 완료" },
        { id: "ec2_launch" as const, label: "타입 변경", status: "done", message: newInstanceType },
        { id: "ec2_running" as const, label: "인스턴스 시작", status: "in_progress", message: "부팅 중...", timestamp: new Date().toISOString() },
        { id: "complete" as const, label: "완료", status: "pending" },
      ],
    });

    await ec2Client.send(new StartInstancesCommand({ InstanceIds: [sandbox.instanceId] }));
    await waitUntilInstanceRunning(
      { client: ec2Client, maxWaitTime: 300 },
      { InstanceIds: [sandbox.instanceId] }
    );

    await updateSandboxStatus(userId, sandboxId, {
      status: "running",
      instanceType: newInstanceType,
      provisioningSteps: undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`changeInstanceType failed for ${sandboxId}:`, err);
    await updateSandboxStatus(userId, sandboxId, {
      status: "error",
      errorMessage: `인스턴스 타입 변경 실패: ${msg}`,
    });
  }

  return (await getSandbox(userId, sandboxId))!;
}
