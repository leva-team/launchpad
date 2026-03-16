import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import {
  PROJECT_PREFIX,
  CADDY_HTTP_PORT,
} from "@launchpad/shared";

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly sandboxSecurityGroup: ec2.ISecurityGroup;
  public readonly albSecurityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── VPC ───────────────────────────────────────────────
    // Public + Private subnets, NAT Gateway 1개로 비용 절감
    this.vpc = new ec2.Vpc(this, "Vpc", {
      vpcName: `${PROJECT_PREFIX}-vpc`,
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // ─── ALB Security Group ────────────────────────────────
    this.albSecurityGroup = new ec2.SecurityGroup(
      this,
      "AlbSecurityGroup",
      {
        vpc: this.vpc,
        securityGroupName: `${PROJECT_PREFIX}-alb-sg`,
        description: "Security group for Sandbox ALB",
        allowAllOutbound: true,
      }
    );

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP"
    );
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "Allow HTTPS"
    );

    // ─── Sandbox Security Group ────────────────────────────
    // ALB에서만 인바운드 허용 (private subnet이므로 direct access 불필요)
    this.sandboxSecurityGroup = new ec2.SecurityGroup(
      this,
      "SandboxSecurityGroup",
      {
        vpc: this.vpc,
        securityGroupName: `${PROJECT_PREFIX}-sandbox-sg`,
        description: "Security group for Launchpad sandbox EC2 instances",
        allowAllOutbound: true,
      }
    );

    // ALB → Sandbox (Caddy HTTP)
    this.sandboxSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(this.albSecurityGroup.securityGroupId),
      ec2.Port.tcp(CADDY_HTTP_PORT),
      "Allow HTTP from ALB"
    );

    // ─── Outputs ───────────────────────────────────────────
    new cdk.CfnOutput(this, "VpcId", {
      value: this.vpc.vpcId,
      exportName: `${PROJECT_PREFIX}-vpc-id`,
    });

    new cdk.CfnOutput(this, "SecurityGroupId", {
      value: this.sandboxSecurityGroup.securityGroupId,
      exportName: `${PROJECT_PREFIX}-sandbox-sg-id`,
    });

    new cdk.CfnOutput(this, "AlbSecurityGroupId", {
      value: this.albSecurityGroup.securityGroupId,
      exportName: `${PROJECT_PREFIX}-alb-sg-id`,
    });

    new cdk.CfnOutput(this, "PublicSubnetIds", {
      value: this.vpc
        .selectSubnets({ subnetType: ec2.SubnetType.PUBLIC })
        .subnetIds.join(","),
      exportName: `${PROJECT_PREFIX}-public-subnet-ids`,
    });

    new cdk.CfnOutput(this, "PrivateSubnetIds", {
      value: this.vpc
        .selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS })
        .subnetIds.join(","),
      exportName: `${PROJECT_PREFIX}-private-subnet-ids`,
    });
  }
}
