#!/bin/bash
set -euxo pipefail

echo "=== Setting up systemd services ==="

NODE_BIN="/home/ubuntu/.nvm/versions/node/v22.0.0/bin"

# ─── opencode serve systemd 서비스 ──────────────────────────
# 실제 노드 버전 경로는 부팅 시 init 스크립트에서 보정
sudo tee /etc/systemd/system/opencode-serve.service > /dev/null << 'EOF'
[Unit]
Description=OpenCode Serve (AI Agent Backend)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu/workspace
Environment=HOME=/home/ubuntu
EnvironmentFile=-/etc/launchpad/env
ExecStartPre=/opt/launchpad/scripts/resolve-node-path.sh
ExecStart=/home/ubuntu/.local/bin/opencode serve --port 8000 --host 0.0.0.0
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=opencode-serve

[Install]
WantedBy=multi-user.target
EOF

# ─── omo-web systemd 서비스 ────────────────────────────────
sudo tee /etc/systemd/system/omo-web.service > /dev/null << 'EOF'
[Unit]
Description=OMO Web Dashboard (OpenCode Web UI)
After=opencode-serve.service
Wants=opencode-serve.service

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/opt/omo-web
Environment=HOME=/home/ubuntu
Environment=NODE_ENV=production
Environment=NEXT_PUBLIC_OPENCODE_URL=http://localhost:8000
EnvironmentFile=-/etc/launchpad/env
ExecStart=/home/ubuntu/.local/bin/npm start -- -p 3000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=omo-web

[Install]
WantedBy=multi-user.target
EOF

# ─── Launchpad 초기화 스크립트 ─────────────────────────────
sudo mkdir -p /opt/launchpad/scripts

# Node path resolver (노드 실제 경로 동적 해결)
sudo tee /opt/launchpad/scripts/resolve-node-path.sh > /dev/null << 'RESOLVE_EOF'
#!/bin/bash
# NVM으로 설치된 node의 실제 경로를 resolve하여 PATH에 추가
export NVM_DIR="/home/ubuntu/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

NODE_PATH=$(dirname $(which node))
NPM_PATH=$(dirname $(which npm))

# Symlink to a stable path
mkdir -p /home/ubuntu/.local/bin
ln -sf $(which node) /home/ubuntu/.local/bin/node
ln -sf $(which npm) /home/ubuntu/.local/bin/npm
ln -sf $(which npx) /home/ubuntu/.local/bin/npx
ln -sf $(which opencode) /home/ubuntu/.local/bin/opencode 2>/dev/null || true
ln -sf $(which pm2) /home/ubuntu/.local/bin/pm2 2>/dev/null || true
RESOLVE_EOF
sudo chmod +x /opt/launchpad/scripts/resolve-node-path.sh

# ─── 인스턴스 초기화 스크립트 (부팅 시 실행) ────────────────
sudo tee /opt/launchpad/scripts/init-sandbox.sh > /dev/null << 'INIT_EOF'
#!/bin/bash
set -euxo pipefail

# IMDSv2 토큰
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

# 인스턴스 메타데이터
INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/instance-id)
REGION=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/placement/region)
PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/public-ipv4)

# 인스턴스 태그에서 샌드박스 이름 읽기
SANDBOX_NAME=$(aws ec2 describe-tags \
  --region "$REGION" \
  --filters "Name=resource-id,Values=$INSTANCE_ID" "Name=key,Values=SandboxName" \
  --query "Tags[0].Value" --output text)

# 환경 변수 파일 생성
sudo mkdir -p /etc/launchpad
sudo tee /etc/launchpad/env > /dev/null << ENV_EOF
INSTANCE_ID=$INSTANCE_ID
REGION=$REGION
PUBLIC_IP=$PUBLIC_IP
SANDBOX_NAME=$SANDBOX_NAME
SANDBOX_DOMAIN=${SANDBOX_NAME}.sandbox.adreamer.now
BASE_DOMAIN=adreamer.now
PATH=/home/ubuntu/.local/bin:/home/ubuntu/.nvm/versions/node/v22.0.0/bin:/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin
ENV_EOF

# Node path 해결
su - ubuntu -c "/opt/launchpad/scripts/resolve-node-path.sh"

# 워크스페이스 디렉토리 생성
mkdir -p /home/ubuntu/workspace
chown ubuntu:ubuntu /home/ubuntu/workspace

# Deploy skill 심볼릭 링크
mkdir -p /home/ubuntu/.opencode/skills
ln -sf /opt/launchpad/skills/deploy /home/ubuntu/.opencode/skills/deploy 2>/dev/null || true

# Caddy 설정 업데이트 (도메인 반영)
cat > /etc/caddy/Caddyfile << CADDY_EOF
{
  admin off
  email admin@adreamer.now
}

# Sandbox Web UI
${SANDBOX_NAME}.sandbox.adreamer.now {
  # omo-web
  reverse_proxy localhost:3000

  tls {
    dns route53
  }
}
CADDY_EOF

# 서비스 시작
systemctl daemon-reload
systemctl restart caddy
systemctl restart opencode-serve
systemctl restart omo-web

echo "Sandbox $SANDBOX_NAME initialized at $PUBLIC_IP" | logger -t launchpad
INIT_EOF
sudo chmod +x /opt/launchpad/scripts/init-sandbox.sh

# ─── 부팅 시 init 스크립트 실행하는 systemd 서비스 ──────────
sudo tee /etc/systemd/system/launchpad-init.service > /dev/null << 'EOF'
[Unit]
Description=Launchpad Sandbox Initialization
After=network-online.target cloud-final.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/launchpad/scripts/init-sandbox.sh
RemainAfterExit=yes
StandardOutput=journal
StandardError=journal
SyslogIdentifier=launchpad-init

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable launchpad-init.service
sudo systemctl enable opencode-serve.service
sudo systemctl enable omo-web.service

echo "=== Systemd services configured ==="
