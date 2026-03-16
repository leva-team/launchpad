import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { PROJECT_PREFIX } from "@launchpad/shared";

interface DashboardStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

/**
 * Launchpad 대시보드 EC2 배포 스택
 * - Next.js 앱을 실행하는 단일 EC2
 * - S3에서 빌드 아티팩트 다운로드
 * - Caddy로 HTTPS 리버스 프록시
 * - Sandbox 프로비저닝을 위한 IAM 권한
 */
export class DashboardStack extends cdk.Stack {
  public readonly instance: ec2.Instance;
  public readonly artifactBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: DashboardStackProps) {
    super(scope, id, props);

    // ─── Artifact Bucket ───────────────────────────────────
    this.artifactBucket = new s3.Bucket(this, "ArtifactBucket", {
      bucketName: `${PROJECT_PREFIX}-dashboard-artifacts-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        { expiration: cdk.Duration.days(30) }, // 오래된 빌드 자동 정리
      ],
    });

    // ─── Security Group ────────────────────────────────────
    const sg = new ec2.SecurityGroup(this, "DashboardSG", {
      vpc: props.vpc,
      securityGroupName: `${PROJECT_PREFIX}-dashboard-sg`,
      description: "Launchpad Dashboard EC2",
      allowAllOutbound: true,
    });

    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP");
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS");
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), "SSH");
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3001), "Next.js direct");

    // ─── IAM Role ──────────────────────────────────────────
    const role = new iam.Role(this, "DashboardRole", {
      roleName: `${PROJECT_PREFIX}-dashboard-role`,
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
      ],
    });

    // S3 아티팩트 읽기
    this.artifactBucket.grantRead(role);

    // Sandbox 프로비저닝 권한 (EC2, IAM, Route53, DynamoDB, SSM)
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "EC2Management",
        effect: iam.Effect.ALLOW,
        actions: [
          "ec2:RunInstances", "ec2:TerminateInstances",
          "ec2:StartInstances", "ec2:StopInstances", "ec2:RebootInstances",
          "ec2:DescribeInstances", "ec2:DescribeInstanceStatus",
          "ec2:CreateTags", "ec2:DescribeTags",
          "ec2:AllocateAddress", "ec2:AssociateAddress",
          "ec2:ReleaseAddress", "ec2:DisassociateAddress", "ec2:DescribeAddresses",
          "ec2:DescribeLaunchTemplates", "ec2:DescribeLaunchTemplateVersions",
        ],
        resources: ["*"],
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "IAMManagement",
        effect: iam.Effect.ALLOW,
        actions: [
          "iam:CreateRole", "iam:DeleteRole", "iam:TagRole",
          "iam:AttachRolePolicy", "iam:DetachRolePolicy",
          "iam:PutRolePolicy", "iam:DeleteRolePolicy",
          "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile",
          "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile",
          "iam:TagInstanceProfile", "iam:PassRole",
          "iam:GetRole", "iam:GetInstanceProfile", "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
        ],
        resources: [
          `arn:aws:iam::${this.account}:role/${PROJECT_PREFIX}-sandbox-*`,
          `arn:aws:iam::${this.account}:role/sandbox/*`,
          `arn:aws:iam::${this.account}:instance-profile/${PROJECT_PREFIX}-sandbox-*`,
          `arn:aws:iam::${this.account}:instance-profile/sandbox/*`,
        ],
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "Route53Management",
        effect: iam.Effect.ALLOW,
        actions: [
          "route53:ChangeResourceRecordSets",
          "route53:ListResourceRecordSets",
          "route53:GetHostedZone",
          "route53:ListHostedZones",
          "route53:ListHostedZonesByName",
        ],
        resources: ["*"],
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "DynamoDB",
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem",
          "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan",
        ],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${PROJECT_PREFIX}-sandboxes`,
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${PROJECT_PREFIX}-sandboxes/index/*`,
        ],
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "SSMAccess",
        effect: iam.Effect.ALLOW,
        actions: [
          "ssm:GetParameter", "ssm:GetParameters",
          "ssm:SendCommand", "ssm:GetCommandInvocation",
          "ssm:ListCommands", "ssm:ListCommandInvocations",
        ],
        resources: ["*"],
      })
    );

    // ELBv2 — Sandbox ALB Target Group/Rule 관리
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "ELBv2Management",
        effect: iam.Effect.ALLOW,
        actions: [
          "elasticloadbalancing:CreateTargetGroup",
          "elasticloadbalancing:DeleteTargetGroup",
          "elasticloadbalancing:RegisterTargets",
          "elasticloadbalancing:DeregisterTargets",
          "elasticloadbalancing:CreateRule",
          "elasticloadbalancing:DeleteRule",
          "elasticloadbalancing:DescribeRules",
          "elasticloadbalancing:DescribeTargetGroups",
          "elasticloadbalancing:ModifyTargetGroupAttributes",
        ],
        resources: ["*"],
      })
    );

    // Cognito 읽기 (토큰 검증용 JWKS)
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: "CognitoRead",
        effect: iam.Effect.ALLOW,
        actions: [
          "cognito-idp:DescribeUserPool",
          "cognito-idp:DescribeUserPoolClient",
          "cognito-idp:UpdateUserPoolClient",
          "cognito-idp:GetSigningCertificate",
        ],
        resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`],
      })
    );

    // ─── EC2 Instance ──────────────────────────────────────
    this.instance = new ec2.Instance(this, "DashboardInstance", {
      instanceName: `${PROJECT_PREFIX}-dashboard`,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.SMALL
      ),
      machineImage: ec2.MachineImage.fromSsmParameter(
        "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
      ),
      role,
      securityGroup: sg,
      blockDevices: [
        {
          deviceName: "/dev/sda1",
          volume: ec2.BlockDeviceVolume.ebs(30, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
      requireImdsv2: true,
      associatePublicIpAddress: true,
      keyPair: undefined, // SSM으로 접속, SSH 키 불필요
      userData: this.createUserData(),
    });

    // ─── Outputs ───────────────────────────────────────────
    new cdk.CfnOutput(this, "DashboardInstanceId", {
      value: this.instance.instanceId,
      exportName: `${PROJECT_PREFIX}-dashboard-instance-id`,
    });

    new cdk.CfnOutput(this, "DashboardPublicIp", {
      value: this.instance.instancePublicIp,
      exportName: `${PROJECT_PREFIX}-dashboard-public-ip`,
    });

    new cdk.CfnOutput(this, "DashboardUrl", {
      value: `http://${this.instance.instancePublicIp}:3001`,
      exportName: `${PROJECT_PREFIX}-dashboard-url`,
    });

    new cdk.CfnOutput(this, "ArtifactBucketName", {
      value: this.artifactBucket.bucketName,
      exportName: `${PROJECT_PREFIX}-artifact-bucket`,
    });
  }

  private createUserData(): ec2.UserData {
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "#!/bin/bash",
      "set -euxo pipefail",
      "exec > >(tee /var/log/launchpad-userdata.log) 2>&1",
      "",
      "# System packages",
      "apt-get update && apt-get upgrade -y",
      "apt-get install -y curl git build-essential unzip jq",
      "",
      "# Node.js 22 via NodeSource",
      "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
      "apt-get install -y nodejs",
      "",
      "# PM2",
      "npm install -g pm2",
      "",
      "# AWS CLI",
      "curl -sL 'https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip' -o /tmp/awscliv2.zip",
      "unzip -q /tmp/awscliv2.zip -d /tmp && /tmp/aws/install && rm -rf /tmp/aws*",
      "",
      "# Caddy",
      "apt-get install -y debian-keyring debian-archive-keyring apt-transport-https",
      "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg",
      "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list",
      "apt-get update && apt-get install -y caddy",
      "",
      "# App directory",
      "mkdir -p /opt/launchpad/dashboard",
      "chown -R ubuntu:ubuntu /opt/launchpad",
      "",
      "# Caddy config — port 80 → Next.js 3001",
      "cat > /etc/caddy/Caddyfile << 'CADDY_EOF'",
      ":80 {",
      "  reverse_proxy localhost:3001",
      "}",
      "CADDY_EOF",
      "systemctl enable caddy && systemctl restart caddy",
      "",
      "# Dashboard systemd service",
      "cat > /etc/systemd/system/launchpad-dashboard.service << 'SVC_EOF'",
      "[Unit]",
      "Description=Launchpad Dashboard",
      "After=network-online.target",
      "Wants=network-online.target",
      "",
      "[Service]",
      "Type=simple",
      "User=ubuntu",
      "WorkingDirectory=/opt/launchpad/dashboard",
      "EnvironmentFile=-/opt/launchpad/dashboard/.env",
      "ExecStart=/usr/bin/npm start",
      "Restart=always",
      "RestartSec=5",
      "",
      "[Install]",
      "WantedBy=multi-user.target",
      "SVC_EOF",
      "systemctl daemon-reload",
      "systemctl enable launchpad-dashboard",
      "",
      "echo 'Dashboard EC2 provisioning complete' > /var/log/launchpad-init.log"
    );
    return userData;
  }
}
