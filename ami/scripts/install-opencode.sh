#!/bin/bash
set -euxo pipefail

echo "=== Installing Node.js, OpenCode, oh-my-openagent ==="

# Node.js via nvm (ubuntu 사용자)
export HOME=/home/ubuntu

su - ubuntu -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash'
su - ubuntu -c 'source ~/.nvm/nvm.sh && nvm install 22 && nvm alias default 22'

# Get the actual node version path
NODE_VERSION=$(su - ubuntu -c 'source ~/.nvm/nvm.sh && node --version')
NODE_BIN="/home/ubuntu/.nvm/versions/node/${NODE_VERSION}/bin"

# PM2 (프로세스 매니저)
su - ubuntu -c "source ~/.nvm/nvm.sh && npm install -g pm2"

# OpenCode CLI
su - ubuntu -c "source ~/.nvm/nvm.sh && npm install -g opencode-ai"

# oh-my-openagent
su - ubuntu -c "source ~/.nvm/nvm.sh && npm install -g oh-my-openagent"

# omo-web (git clone + build)
sudo git clone https://github.com/anthropics/omo-web.git /opt/omo-web || true
sudo chown -R ubuntu:ubuntu /opt/omo-web
su - ubuntu -c "source ~/.nvm/nvm.sh && cd /opt/omo-web && npm install && npm run build"

# Python (개발 프로젝트용)
sudo apt-get install -y python3 python3-pip python3-venv

# Go (개발 프로젝트용)
GO_VERSION="1.23.4"
curl -sL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -o /tmp/go.tar.gz
sudo tar -C /usr/local -xzf /tmp/go.tar.gz
rm /tmp/go.tar.gz

# PATH 설정
cat >> /home/ubuntu/.bashrc << 'BASHRC_EOF'

# Launchpad environment
export PATH="$PATH:/usr/local/go/bin:$HOME/go/bin"
export GOPATH="$HOME/go"

# NVM auto-load
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
BASHRC_EOF

echo "=== OpenCode installation complete ==="
