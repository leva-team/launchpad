#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENVS_DIR="$PROJECT_ROOT/envs"
DASHBOARD_DIR="$PROJECT_ROOT/packages/dashboard"
TARGETS_FILE="$ENVS_DIR/deploy-targets.json"

ENV_NAME="${1:-}"
if [ -z "$ENV_NAME" ]; then
  echo "Usage: $0 <environment>"
  echo ""
  echo "Available environments:"
  jq -r 'keys[]' "$TARGETS_FILE" | while read -r env; do
    profile=$(jq -r ".[\"$env\"].profile" "$TARGETS_FILE")
    echo "  $env (profile: $profile)"
  done
  exit 1
fi

PROFILE=$(jq -r ".[\"$ENV_NAME\"].profile" "$TARGETS_FILE")
INSTANCE_ID=$(jq -r ".[\"$ENV_NAME\"].instanceId" "$TARGETS_FILE")
S3_BUCKET=$(jq -r ".[\"$ENV_NAME\"].s3Bucket" "$TARGETS_FILE")
ENV_FILE=$(jq -r ".[\"$ENV_NAME\"].envFile" "$TARGETS_FILE")

if [ "$PROFILE" = "null" ]; then
  echo "Environment '$ENV_NAME' not found in $TARGETS_FILE"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deploying: $ENV_NAME"
echo "  Profile:   $PROFILE"
echo "  Instance:  $INSTANCE_ID"
echo "  S3:        $S3_BUCKET"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "[1/5] Building shared..."
cd "$PROJECT_ROOT/packages/shared" && npx tsc

echo "[2/5] Building dashboard with $ENV_FILE..."
cd "$DASHBOARD_DIR"
cp .env .env.backup 2>/dev/null || true
cp "$ENVS_DIR/$ENV_FILE" .env
npm run build
cp -r .next/static .next/standalone/workspaces/launchpad/packages/dashboard/.next/
cp -r public .next/standalone/workspaces/launchpad/packages/dashboard/ 2>/dev/null || true
cp .env .next/standalone/workspaces/launchpad/packages/dashboard/
cp .env.backup .env 2>/dev/null || true

echo "[3/5] Packaging..."
tar czf /tmp/launchpad-dashboard-${ENV_NAME}.tar.gz -C .next/standalone .

echo "[4/5] Uploading to S3..."
aws s3 cp /tmp/launchpad-dashboard-${ENV_NAME}.tar.gz "s3://$S3_BUCKET/dashboard-latest.tar.gz" --profile "$PROFILE"

echo "[5/5] Deploying to EC2..."
CMD_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters commands='["#!/bin/bash","set -eux","aws s3 cp s3://'"$S3_BUCKET"'/dashboard-latest.tar.gz /tmp/dashboard.tar.gz","rm -rf /opt/launchpad/dashboard","mkdir -p /opt/launchpad/dashboard","tar xzf /tmp/dashboard.tar.gz -C /opt/launchpad/dashboard","chown -R ubuntu:ubuntu /opt/launchpad","systemctl restart launchpad-dashboard","sleep 3","systemctl is-active launchpad-dashboard"]' \
  --timeout-seconds 120 \
  --profile "$PROFILE" \
  --query "Command.CommandId" --output text)

echo "  SSM Command: $CMD_ID"
echo "  Waiting..."
sleep 25

STATUS=$(aws ssm get-command-invocation \
  --command-id "$CMD_ID" \
  --instance-id "$INSTANCE_ID" \
  --profile "$PROFILE" \
  --query "Status" --output text)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$STATUS" = "Success" ]; then
  echo "  ✅ Deploy complete: $ENV_NAME"
else
  echo "  ❌ Deploy failed: $STATUS"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
