import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { PROJECT_PREFIX } from "@launchpad/shared";

export interface SandboxLaunchTemplateProps {
  vpc: ec2.IVpc;
  securityGroup: ec2.ISecurityGroup;
}

/**
 * CDK에서 LaunchTemplate을 생성.
 * 런타임에 AWS SDK RunInstances가 이 템플릿을 참조하여 EC2를 생성한다.
 *
 * Per-sandbox IAM Role/InstanceProfile은 런타임에 SDK로 동적 생성.
 * LaunchTemplate에는 base role만 설정 (SSM 접근 등 공통 권한).
 */
export class SandboxLaunchTemplate extends Construct {
  public readonly launchTemplate: ec2.LaunchTemplate;
  public readonly baseRole: iam.IRole;
  public readonly amiParameter: ssm.StringParameter;

  constructor(scope: Construct, id: string, props: SandboxLaunchTemplateProps) {
    super(scope, id);

    // ─── Base Role (LaunchTemplate 기본, 런타임에 override됨) ──
    const baseRole = new iam.Role(this, "BaseRole", {
      roleName: `${PROJECT_PREFIX}-sandbox-base-role`,
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        // SSM으로 SSH 없이 접속 가능하게
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
      ],
    });
    this.baseRole = baseRole;

    // ─── SSM Parameter: AMI ID ─────────────────────────────
    // Packer로 빌드한 AMI ID를 여기에 저장. 런타임에 읽어서 사용.
    // 초기값은 Ubuntu 24.04 기본 이미지 (fallback)
    this.amiParameter = new ssm.StringParameter(this, "AmiParameter", {
      parameterName: `/${PROJECT_PREFIX}/sandbox/ami-id`,
      stringValue: "PLACEHOLDER_AMI_ID", // packer 빌드 후 업데이트
      description: "Launchpad sandbox AMI ID (updated by Packer build)",
    });

    // ─── Launch Template ───────────────────────────────────
    this.launchTemplate = new ec2.LaunchTemplate(this, "Template", {
      launchTemplateName: `${PROJECT_PREFIX}-sandbox-template`,
      machineImage: ec2.MachineImage.fromSsmParameter(
        "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
      ),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.C7I,
        ec2.InstanceSize.LARGE
      ),
      blockDevices: [
        {
          deviceName: "/dev/sda1",
          volume: ec2.BlockDeviceVolume.ebs(50, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
      role: baseRole,
      requireImdsv2: true,
      instanceMetadataTags: true,
      securityGroup: props.securityGroup,
      userData: this.createUserData(),
    });

    // ─── Outputs ───────────────────────────────────────────
    new cdk.CfnOutput(
      cdk.Stack.of(this),
      "LaunchTemplateId",
      {
        value: this.launchTemplate.launchTemplateId!,
        exportName: `${PROJECT_PREFIX}-launch-template-id`,
      }
    );

    new cdk.CfnOutput(
      cdk.Stack.of(this),
      "AmiParameterName",
      {
        value: this.amiParameter.parameterName,
        exportName: `${PROJECT_PREFIX}-ami-parameter-name`,
      }
    );
  }

  /**
   * Base UserData — Packer AMI가 없을 때 fallback으로 사용.
   * Packer AMI가 있으면 이 스크립트의 대부분은 skip됨 (idempotent).
   */
  private createUserData(): ec2.UserData {
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "#!/bin/bash",
      "set -euxo pipefail",
      "exec > >(tee /var/log/launchpad-userdata.log) 2>&1",
      "",
      "apt-get update && apt-get upgrade -y",
      "apt-get install -y curl git build-essential unzip jq htop tmux",
      "",
      "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
      "apt-get install -y nodejs",
      "",
      "npm install -g pm2 opencode-ai oh-my-openagent",
      "",
      "curl -sL 'https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip' -o /tmp/awscliv2.zip",
      "unzip -q /tmp/awscliv2.zip -d /tmp && /tmp/aws/install && rm -rf /tmp/aws*",
      "",
      "apt-get install -y debian-keyring debian-archive-keyring apt-transport-https",
      "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg",
      "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list",
      "apt-get update && apt-get install -y caddy",
      "",
      "printf ':80 {\\n  reverse_proxy localhost:3000\\n}\\n' > /etc/caddy/Caddyfile",
      "systemctl enable caddy && systemctl restart caddy",
      "",
      "mkdir -p /home/ubuntu/workspace",
      "chown ubuntu:ubuntu /home/ubuntu/workspace",
      "",
      "mkdir -p /home/ubuntu/.config/opencode",
      "cat > /home/ubuntu/.config/opencode/opencode.json << 'OCJSON'",
      '{"$schema":"https://opencode.ai/config.json","plugin":["oh-my-opencode"]}',
      "OCJSON",
      "cat > /home/ubuntu/.config/opencode/oh-my-opencode.jsonc << 'OMOJSON'",
      '{',
      '  "$schema": "https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/assets/oh-my-opencode.schema.json",',
      '  "agents": {',
      '    "sisyphus": { "model": "anthropic/claude-opus-4-6", "variant": "max" },',
      '    "oracle": { "model": "anthropic/claude-opus-4-6", "variant": "max" },',
      '    "librarian": { "model": "anthropic/claude-sonnet-4-6" },',
      '    "explore": { "model": "anthropic/claude-haiku-4-5" },',
      '    "multimodal-looker": { "model": "opencode/glm-4.7-free" },',
      '    "prometheus": { "model": "anthropic/claude-opus-4-6", "variant": "max" },',
      '    "metis": { "model": "anthropic/claude-opus-4-6", "variant": "max" },',
      '    "momus": { "model": "anthropic/claude-opus-4-6", "variant": "max" },',
      '    "atlas": { "model": "anthropic/claude-sonnet-4-6" }',
      '  },',
      '  "categories": {',
      '    "visual-engineering": { "model": "google/gemini-3.1-pro" },',
      '    "ultrabrain": { "model": "anthropic/claude-opus-4-6", "variant": "max" },',
      '    "quick": { "model": "anthropic/claude-haiku-4-5" },',
      '    "unspecified-low": { "model": "anthropic/claude-sonnet-4-6" },',
      '    "unspecified-high": { "model": "anthropic/claude-opus-4-6", "variant": "max" },',
      '    "writing": { "model": "anthropic/claude-sonnet-4-6" }',
      '  }',
      '}',
      "OMOJSON",
      "chown -R ubuntu:ubuntu /home/ubuntu/.config",
      "",
      "su - ubuntu -c 'cd /home/ubuntu/workspace && pm2 start opencode -- web --port 3000 --hostname 0.0.0.0'",
      "su - ubuntu -c 'pm2 save'",
      "env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -1 | bash || true",
      "",
      "echo 'Launchpad sandbox ready' > /var/log/launchpad-init.log"
    );

    return userData;
  }
}
