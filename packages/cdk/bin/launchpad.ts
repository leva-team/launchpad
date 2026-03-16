#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/stacks/network-stack";
import { SandboxAlbStack } from "../lib/stacks/sandbox-alb-stack";
import { CognitoStack } from "../lib/stacks/cognito-stack";
import { DataStack } from "../lib/stacks/data-stack";
import { DashboardStack } from "../lib/stacks/dashboard-stack";
import { SandboxLaunchTemplate } from "../lib/constructs/sandbox-launch-template";
import { AWS_REGION, PROJECT_PREFIX } from "@launchpad/shared";

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: AWS_REGION,
};

// ─── 1. Network (VPC, Security Groups) ────────────────────
const networkStack = new NetworkStack(app, `${PROJECT_PREFIX}-network`, {
  env,
  description: "Launchpad: VPC, Security Groups",
});

// ─── 2. Sandbox ALB (Public ALB for sandbox routing) ──────
const sandboxAlbStack = new SandboxAlbStack(
  app,
  `${PROJECT_PREFIX}-sandbox-alb`,
  {
    env,
    vpc: networkStack.vpc,
    albSecurityGroup: networkStack.albSecurityGroup,
    description: "Launchpad: Sandbox ALB with wildcard cert and host-based routing",
  }
);
sandboxAlbStack.addDependency(networkStack);

// ─── 3. Cognito (Authentication) ──────────────────────────
const cognitoStack = new CognitoStack(app, `${PROJECT_PREFIX}-cognito`, {
  env,
  description: "Launchpad: Cognito User Pool and App Client",
});

// ─── 4. Data (DynamoDB, Provisioner IAM) ──────────────────
const dataStack = new DataStack(app, `${PROJECT_PREFIX}-data`, {
  env,
  description: "Launchpad: DynamoDB table and provisioner IAM role",
});

// ─── 5. Sandbox Infrastructure ────────────────────────────
// LaunchTemplate은 NetworkStack 위에 구성
const sandboxInfraStack = new cdk.Stack(
  app,
  `${PROJECT_PREFIX}-sandbox-infra`,
  {
    env,
    description: "Launchpad: EC2 LaunchTemplate for sandbox instances",
  }
);

new SandboxLaunchTemplate(sandboxInfraStack, "SandboxTemplate", {
  vpc: networkStack.vpc,
  securityGroup: networkStack.sandboxSecurityGroup,
});

sandboxInfraStack.addDependency(networkStack);

// ─── 6. Dashboard (EC2 for Next.js dashboard) ─────────────
const dashboardStack = new DashboardStack(
  app,
  `${PROJECT_PREFIX}-dashboard`,
  {
    env,
    vpc: networkStack.vpc,
    description: "Launchpad: Dashboard EC2 instance",
  }
);

dashboardStack.addDependency(networkStack);

// ─── Tags ──────────────────────────────────────────────────
cdk.Tags.of(app).add("Project", "Launchpad");
cdk.Tags.of(app).add("ManagedBy", "cdk");
