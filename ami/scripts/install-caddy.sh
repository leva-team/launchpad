#!/bin/bash
set -euxo pipefail

echo "=== Installing Caddy reverse proxy ==="

# Caddy with Route53 DNS plugin (Let's Encrypt DNS challenge용)
# 커스텀 빌드: caddy + caddy-dns/route53
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list

sudo apt-get update && sudo apt-get install -y caddy

# xcaddy로 Route53 DNS 플러그인 포함 빌드
export HOME=/home/ubuntu
su - ubuntu -c "source ~/.nvm/nvm.sh && go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest" || true
su - ubuntu -c "source ~/.nvm/nvm.sh && export PATH=\$PATH:/usr/local/go/bin:\$HOME/go/bin && xcaddy build --with github.com/caddy-dns/route53 --output /tmp/caddy-custom" || true

# 커스텀 빌드 성공 시 교체
if [ -f /tmp/caddy-custom ]; then
  sudo systemctl stop caddy
  sudo mv /tmp/caddy-custom /usr/bin/caddy
  sudo chmod +x /usr/bin/caddy
fi

# 기본 Caddyfile
sudo tee /etc/caddy/Caddyfile > /dev/null << 'CADDYFILE_EOF'
{
  admin off
  email admin@adreamer.now
}

# Sandbox opencode web UI (omo-web)
# 인스턴스 기동 시 user-data에서 실제 도메인으로 교체됨
:80 {
  # omo-web (Next.js dashboard)
  reverse_proxy localhost:3000

  # API 요청은 opencode serve로 프록시
  handle_path /api/* {
    reverse_proxy localhost:8000
  }
}
CADDYFILE_EOF

sudo systemctl enable caddy

echo "=== Caddy installation complete ==="
