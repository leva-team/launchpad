import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { PROJECT_PREFIX, DYNAMO_TABLE_NAME } from "@launchpad/shared";

export class DataStack extends cdk.Stack {
  public readonly table: dynamodb.ITable;
  public readonly sandboxProvisionerRole: iam.Role;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── DynamoDB: Single Table Design ─────────────────────
    const table = new dynamodb.Table(this, "SandboxTable", {
      tableName: DYNAMO_TABLE_NAME,
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    // GSI1: Lookup by sandboxId or domain
    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.table = table;

    // ─── Sandbox Provisioner Role ──────────────────────────
    // Dashboard API (Lambda) uses this role to create/manage sandboxes
    this.sandboxProvisionerRole = new iam.Role(
      this,
      "SandboxProvisionerRole",
      {
        roleName: `${PROJECT_PREFIX}-sandbox-provisioner`,
        assumedBy: new iam.CompositePrincipal(
          new iam.ServicePrincipal("lambda.amazonaws.com"),
          new iam.ServicePrincipal("ecs-tasks.amazonaws.com")
        ),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole"
          ),
        ],
      }
    );

    // EC2 management permissions
    this.sandboxProvisionerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "EC2Management",
        effect: iam.Effect.ALLOW,
        actions: [
          "ec2:RunInstances",
          "ec2:TerminateInstances",
          "ec2:StartInstances",
          "ec2:StopInstances",
          "ec2:RebootInstances",
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceStatus",
          "ec2:CreateTags",
          "ec2:AllocateAddress",
          "ec2:AssociateAddress",
          "ec2:ReleaseAddress",
          "ec2:DisassociateAddress",
          "ec2:DescribeAddresses",
        ],
        resources: ["*"],
      })
    );

    // IAM management (scoped to sandbox roles only)
    this.sandboxProvisionerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "IAMManagement",
        effect: iam.Effect.ALLOW,
        actions: [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:CreateInstanceProfile",
          "iam:DeleteInstanceProfile",
          "iam:AddRoleToInstanceProfile",
          "iam:RemoveRoleFromInstanceProfile",
          "iam:PassRole",
          "iam:GetRole",
          "iam:GetInstanceProfile",
        ],
        resources: [
          `arn:aws:iam::*:role/${PROJECT_PREFIX}-sandbox-*`,
          `arn:aws:iam::*:instance-profile/${PROJECT_PREFIX}-sandbox-*`,
        ],
      })
    );

    // Route53 management
    this.sandboxProvisionerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "Route53Management",
        effect: iam.Effect.ALLOW,
        actions: [
          "route53:ChangeResourceRecordSets",
          "route53:ListResourceRecordSets",
          "route53:GetHostedZone",
          "route53:ListHostedZonesByName",
        ],
        resources: ["*"],
      })
    );

    // DynamoDB access
    table.grantReadWriteData(this.sandboxProvisionerRole);

    // ─── Outputs ───────────────────────────────────────────
    new cdk.CfnOutput(this, "TableName", {
      value: table.tableName,
      exportName: `${PROJECT_PREFIX}-table-name`,
    });

    new cdk.CfnOutput(this, "TableArn", {
      value: table.tableArn,
      exportName: `${PROJECT_PREFIX}-table-arn`,
    });

    new cdk.CfnOutput(this, "ProvisionerRoleArn", {
      value: this.sandboxProvisionerRole.roleArn,
      exportName: `${PROJECT_PREFIX}-provisioner-role-arn`,
    });
  }
}
