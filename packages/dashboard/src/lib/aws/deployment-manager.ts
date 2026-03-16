import { PutCommand, GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "./clients";
import { canTransition } from "../deployment/state-machine";
import type { PipelineDeployment, PipelineStatus, Approval, QAResult, StatusHistoryEntry } from "@launchpad/shared";
import { nanoid } from "nanoid";

const TABLE = process.env.DYNAMO_TABLE_NAME ?? "launchpad-sandboxes";

async function saveDeployment(d: PipelineDeployment) {
  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `SVC#${d.serviceId}`,
        SK: `DEPLOY#${d.deployId}`,
        GSI1PK: `DEPLOY#${d.deployId}`,
        GSI1SK: "#META",
        GSI2PK: `DEPLOY_STATUS#${d.status}`,
        GSI2SK: d.createdAt,
        type: "deployment",
        data: d,
      },
    })
  );
}

export async function createDeployment(
  serviceId: string,
  version: string,
  createdBy: string,
  sandboxId?: string
): Promise<PipelineDeployment> {
  const deployId = nanoid(12);
  const now = new Date().toISOString();

  const deployment: PipelineDeployment = {
    deployId,
    serviceId,
    version,
    status: "created",
    sandboxId,
    dockerImageUri: "",
    environments: {},
    createdBy,
    createdAt: now,
    updatedAt: now,
    statusHistory: [{ status: "created", at: now, by: createdBy }],
  };

  await saveDeployment(deployment);
  return deployment;
}

export async function getDeployment(deployId: string): Promise<PipelineDeployment | null> {
  const { Items } = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
      ExpressionAttributeValues: {
        ":pk": `DEPLOY#${deployId}`,
        ":sk": "#META",
      },
    })
  );
  return (Items?.[0]?.data as PipelineDeployment) ?? null;
}

export async function listDeployments(serviceId: string): Promise<PipelineDeployment[]> {
  const { Items } = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `SVC#${serviceId}`,
        ":prefix": "DEPLOY#",
      },
      ScanIndexForward: false,
    })
  );
  return (Items ?? []).map((item) => item.data as PipelineDeployment);
}

export async function transitionDeployment(
  deployId: string,
  targetStatus: PipelineStatus,
  actor: string,
  reason?: string,
  extraUpdates?: Partial<PipelineDeployment>
): Promise<PipelineDeployment> {
  const deploy = await getDeployment(deployId);
  if (!deploy) throw new Error(`Deployment ${deployId} not found`);

  if (!canTransition(deploy.status, targetStatus)) {
    throw new Error(`Invalid transition: ${deploy.status} → ${targetStatus}`);
  }

  const now = new Date().toISOString();
  const entry: StatusHistoryEntry = { status: targetStatus, at: now, by: actor, reason };

  const updated: PipelineDeployment = {
    ...deploy,
    ...extraUpdates,
    status: targetStatus,
    updatedAt: now,
    statusHistory: [...deploy.statusHistory, entry],
  };

  await saveDeployment(updated);
  return updated;
}

export async function createApproval(
  deployId: string,
  serviceId: string,
  serviceName: string,
  approverUserId: string
): Promise<Approval> {
  const approvalId = nanoid(12);
  const now = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + 172800; // 48h

  const approval: Approval = {
    approvalId,
    deployId,
    serviceId,
    serviceName,
    approverUserId,
    status: "pending",
    requestedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `DEPLOY#${deployId}`,
        SK: `APPROVAL#${approvalId}`,
        GSI1PK: `APPROVER#${approverUserId}`,
        GSI1SK: `PENDING#${now}`,
        type: "approval",
        data: approval,
        ttl,
      },
    })
  );

  return approval;
}

export async function getApproval(deployId: string): Promise<Approval | null> {
  const { Items } = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `DEPLOY#${deployId}`,
        ":prefix": "APPROVAL#",
      },
    })
  );
  return (Items?.[0]?.data as Approval) ?? null;
}

export async function listPendingApprovals(approverUserId: string): Promise<Approval[]> {
  const { Items } = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `APPROVER#${approverUserId}`,
        ":prefix": "PENDING#",
      },
    })
  );
  return (Items ?? []).map((item) => item.data as Approval);
}

export async function respondApproval(
  deployId: string,
  approvalId: string,
  approved: boolean,
  comment: string,
  responder: string
): Promise<Approval> {
  const { Items } = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND SK = :sk",
      ExpressionAttributeValues: {
        ":pk": `DEPLOY#${deployId}`,
        ":sk": `APPROVAL#${approvalId}`,
      },
    })
  );

  const item = Items?.[0];
  if (!item) throw new Error("Approval not found");

  const approval = item.data as Approval;
  const now = new Date().toISOString();
  const updated: Approval = {
    ...approval,
    status: approved ? "approved" : "rejected",
    respondedAt: now,
    comment,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        ...item,
        GSI1SK: `${updated.status.toUpperCase()}#${now}`,
        data: updated,
      },
    })
  );

  if (approved) {
    await transitionDeployment(deployId, "deploying_prd", responder, "Approved");
  } else {
    await transitionDeployment(deployId, "rejected", responder, comment);
  }

  return updated;
}

export async function saveQAResult(result: QAResult): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `DEPLOY#${result.deployId}`,
        SK: `QA#${result.qaRunId}`,
        type: "qa_result",
        data: result,
      },
    })
  );
}

export async function listQAResults(deployId: string): Promise<QAResult[]> {
  const { Items } = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `DEPLOY#${deployId}`,
        ":prefix": "QA#",
      },
    })
  );
  return (Items ?? []).map((item) => item.data as QAResult);
}
