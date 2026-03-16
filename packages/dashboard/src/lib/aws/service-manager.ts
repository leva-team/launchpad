import { PutCommand, GetCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "./clients";
import type { Service, CreateServiceRequest, UpdateServiceRequest } from "@launchpad/shared";
import { nanoid } from "nanoid";

const TABLE = process.env.DYNAMO_TABLE_NAME ?? "launchpad-sandboxes";

export async function createService(
  userId: string,
  userName: string,
  req: CreateServiceRequest
): Promise<Service> {
  const serviceId = nanoid(12);
  const now = new Date().toISOString();

  const service: Service = {
    serviceId,
    name: req.name,
    description: req.description,
    purpose: req.purpose,
    ownerUserId: userId,
    ownerName: userName,
    ownerTeam: req.ownerTeam,
    projectStage: req.projectStage ?? "concept",
    sliTargets: [],
    slaTarget: req.slaTarget ?? 99.9,
    firewallPolicy: req.firewallPolicy ?? "internal",
    architectureLinks: [],
    repositoryUrl: req.repositoryUrl ?? "",
    dockerfilePath: req.dockerfilePath ?? "./Dockerfile",
    ecsConfig: {
      cpu: req.ecsConfig?.cpu ?? 256,
      memory: req.ecsConfig?.memory ?? 512,
      desiredCount: req.ecsConfig?.desiredCount ?? 1,
      port: req.ecsConfig?.port ?? 3000,
    },
    deployStrategy: req.deployStrategy ?? "blue-green",
    approverUserIds: [],
    linkedSandboxIds: [],
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `SVC#${serviceId}`,
        SK: "#META",
        GSI1PK: "SERVICES",
        GSI1SK: now,
        type: "service",
        data: service,
      },
    })
  );

  return service;
}

export async function getService(serviceId: string): Promise<Service | null> {
  const { Item } = await docClient.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `SVC#${serviceId}`, SK: "#META" },
    })
  );
  return (Item?.data as Service) ?? null;
}

export async function listServices(): Promise<Service[]> {
  const { Items } = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": "SERVICES" },
      ScanIndexForward: false,
    })
  );
  return (Items ?? []).map((item) => item.data as Service);
}

export async function updateService(
  serviceId: string,
  updates: UpdateServiceRequest
): Promise<Service> {
  const current = await getService(serviceId);
  if (!current) throw new Error(`Service ${serviceId} not found`);

  const merged: Service = {
    ...current,
    ...Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    ),
    ecsConfig: updates.ecsConfig
      ? { ...current.ecsConfig, ...updates.ecsConfig }
      : current.ecsConfig,
    updatedAt: new Date().toISOString(),
  } as Service;

  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `SVC#${serviceId}`,
        SK: "#META",
        GSI1PK: "SERVICES",
        GSI1SK: merged.createdAt,
        type: "service",
        data: merged,
      },
    })
  );

  return merged;
}

export async function deleteService(serviceId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { PK: `SVC#${serviceId}`, SK: "#META" },
    })
  );
}

export async function linkSandbox(serviceId: string, sandboxId: string): Promise<void> {
  const service = await getService(serviceId);
  if (!service) throw new Error(`Service ${serviceId} not found`);
  if (service.linkedSandboxIds.includes(sandboxId)) return;

  await updateService(serviceId, {} as UpdateServiceRequest);
  const updated = await getService(serviceId);
  if (updated) {
    updated.linkedSandboxIds = [...updated.linkedSandboxIds, sandboxId];
    await docClient.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `SVC#${serviceId}`,
          SK: "#META",
          GSI1PK: "SERVICES",
          GSI1SK: updated.createdAt,
          type: "service",
          data: updated,
        },
      })
    );
  }
}

export async function unlinkSandbox(serviceId: string, sandboxId: string): Promise<void> {
  const service = await getService(serviceId);
  if (!service) return;

  service.linkedSandboxIds = service.linkedSandboxIds.filter((id) => id !== sandboxId);
  service.updatedAt = new Date().toISOString();

  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `SVC#${serviceId}`,
        SK: "#META",
        GSI1PK: "SERVICES",
        GSI1SK: service.createdAt,
        type: "service",
        data: service,
      },
    })
  );
}
