#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Launchpad Deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo "ap-northeast-2")

echo "[1/5] Building shared package..."
cd "$PROJECT_ROOT/packages/shared"
npx tsc

echo "[2/5] Synthesizing CDK stacks..."
cd "$PROJECT_ROOT/packages/cdk"
npx cdk synth --quiet 2>&1

echo "[3/5] Deploying infrastructure (Network → Cognito → Data → Dashboard)..."
npx cdk deploy launchpad-network launchpad-cognito launchpad-data launchpad-dashboard \
  --require-approval never \
  --outputs-file "$PROJECT_ROOT/cdk-outputs.json" \
  2>&1

echo "[4/5] Building dashboard..."
cd "$PROJECT_ROOT/packages/dashboard"
npm run build

echo "[5/5] Deploying dashboard to EC2..."
INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name launchpad-dashboard \
  --query "Stacks[0].Outputs[?OutputKey=='DashboardInstanceId'].OutputValue" \
  --output text)

PUBLIC_IP=$(aws cloudformation describe-stacks \
  --stack-name launchpad-dashboard \
  --query "Stacks[0].Outputs[?OutputKey=='DashboardPublicIp'].OutputValue" \
  --output text)

BUCKET=$(aws cloudformation describe-stacks \
  --stack-name launchpad-dashboard \
  --query "Stacks[0].Outputs[?OutputKey=='ArtifactBucketName'].OutputValue" \
  --output text)

# Package and upload to S3
cd "$PROJECT_ROOT/packages/dashboard"
tar czf /tmp/launchpad-dashboard.tar.gz \
  --exclude=node_modules \
  --exclude=.next/cache \
  .next package.json next.config.ts public .env.example

aws s3 cp /tmp/launchpad-dashboard.tar.gz "s3://$BUCKET/dashboard-latest.tar.gz"

# Deploy via SSM
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters "commands=[
    'set -euxo pipefail',
    'aws s3 cp s3://$BUCKET/dashboard-latest.tar.gz /tmp/dashboard.tar.gz',
    'rm -rf /opt/launchpad/dashboard/*',
    'tar xzf /tmp/dashboard.tar.gz -C /opt/launchpad/dashboard',
    'cd /opt/launchpad/dashboard && npm install --production',
    'systemctl restart launchpad-dashboard'
  ]" \
  --timeout-seconds 300 \
  --region "$REGION" \
  --output text

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deploy Complete!"
echo ""
echo "  Dashboard: http://$PUBLIC_IP"
echo "  Instance:  $INSTANCE_ID"
echo "  Region:    $REGION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
