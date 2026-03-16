# Deploy Skill — Launchpad Sandbox 배포

이 스킬은 현재 EC2 샌드박스에서 프로젝트를 빌드하고 서비스로 배포합니다.
배포 결과는 `{service_name}.adreamer.now` 도메인으로 자동 연결됩니다.

## 실행 조건

- EC2 인스턴스 내부에서 실행 중이어야 함
- Caddy 리버스 프록시가 설치되어 있어야 함
- PM2 프로세스 매니저가 설치되어 있어야 함
- AWS CLI 설정이 되어 있어야 함 (IAM Instance Profile 사용)

## 배포 절차

아래 단계를 **순서대로** 실행하세요:

### 1단계: 프로젝트 감지 및 검증

```bash
# 현재 디렉토리의 프로젝트 타입 감지
ls package.json requirements.txt Cargo.toml go.mod pyproject.toml 2>/dev/null
```

프로젝트 루트에서 다음을 확인:
- `package.json` → Node.js 프로젝트
- `requirements.txt` 또는 `pyproject.toml` → Python 프로젝트
- `go.mod` → Go 프로젝트
- `Cargo.toml` → Rust 프로젝트

### 2단계: 서비스 이름 결정

`package.json`의 `name` 필드 또는 디렉토리명에서 서비스 이름을 추출합니다.
서비스 이름은 도메인에 사용되므로 영문 소문자, 숫자, 하이픈만 허용합니다.

```bash
# Node.js: package.json에서 추출
SERVICE_NAME=$(node -e "console.log(require('./package.json').name)" 2>/dev/null | sed 's/@.*\///' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')

# 또는 디렉토리명 사용
SERVICE_NAME=$(basename "$(pwd)" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')

echo "서비스 이름: $SERVICE_NAME"
echo "배포 도메인: ${SERVICE_NAME}.adreamer.now"
```

### 3단계: 빌드

프로젝트 타입에 따라 빌드를 실행합니다:

**Node.js:**
```bash
npm install
npm run build 2>&1 || { echo "빌드 실패"; exit 1; }
```

**Python:**
```bash
pip install -r requirements.txt
```

**Go:**
```bash
go build -o ./dist/server .
```

### 4단계: 서비스 포트 결정

사용 가능한 포트를 자동으로 찾습니다 (8001~8099 범위).

```bash
# 사용 중인 포트 확인 후 빈 포트 할당
PORT=8001
while ss -tlnp | grep -q ":$PORT "; do
  PORT=$((PORT + 1))
  if [ $PORT -gt 8099 ]; then
    echo "사용 가능한 포트가 없습니다"
    exit 1
  fi
done
echo "할당된 포트: $PORT"
```

### 5단계: PM2로 서비스 등록

```bash
# 기존 프로세스가 있으면 삭제
pm2 delete "$SERVICE_NAME" 2>/dev/null || true

# 프로젝트 타입별 실행
# Node.js (Next.js)
pm2 start npm --name "$SERVICE_NAME" -- start -- -p $PORT

# Node.js (일반 서버)
pm2 start node --name "$SERVICE_NAME" -- dist/index.js --port $PORT

# Python
pm2 start python --name "$SERVICE_NAME" -- -m uvicorn main:app --host 0.0.0.0 --port $PORT

# Go
pm2 start ./dist/server --name "$SERVICE_NAME" -- --port $PORT

# PM2 설정 저장 (재부팅 시 자동 시작)
pm2 save
```

### 6단계: Caddy 리버스 프록시 설정

```bash
# 현재 인스턴스의 퍼블릭 IP 가져오기
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)

# Caddy 설정에 서비스 추가
cat >> /etc/caddy/Caddyfile << EOF

${SERVICE_NAME}.adreamer.now {
  reverse_proxy localhost:${PORT}
  tls {
    dns route53
  }
}
EOF

# Caddy 리로드 (다운타임 없음)
sudo systemctl reload caddy
```

### 7단계: Route53 DNS 등록

```bash
# 호스팅 존 ID 조회
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name "adreamer.now" --query "HostedZones[0].Id" --output text | sed 's|/hostedzone/||')

# A 레코드 UPSERT
aws route53 change-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --change-batch '{
    "Comment": "Launchpad service deployment: '"$SERVICE_NAME"'",
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "'"${SERVICE_NAME}.adreamer.now"'",
        "Type": "A",
        "TTL": 60,
        "ResourceRecords": [{"Value": "'"$PUBLIC_IP"'"}]
      }
    }]
  }'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  배포 완료!"
echo ""
echo "  서비스: $SERVICE_NAME"
echo "  URL: https://${SERVICE_NAME}.adreamer.now"
echo "  포트: $PORT"
echo "  프로세스: pm2 status $SERVICE_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

### 8단계: 헬스 체크

```bash
# 서비스 응답 확인 (최대 30초 대기)
for i in $(seq 1 6); do
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT" | grep -q "200\|301\|302"; then
    echo "헬스 체크 통과 — 서비스 정상 동작"
    break
  fi
  echo "대기 중... ($i/6)"
  sleep 5
done
```

## 롤백

배포에 실패한 경우:

```bash
# PM2 프로세스 중지 및 삭제
pm2 delete "$SERVICE_NAME"

# Caddy 설정에서 해당 서비스 블록 제거 후 리로드
sudo systemctl reload caddy

# Route53 레코드 삭제
aws route53 change-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --change-batch '{
    "Changes": [{
      "Action": "DELETE",
      "ResourceRecordSet": {
        "Name": "'"${SERVICE_NAME}.adreamer.now"'",
        "Type": "A",
        "TTL": 60,
        "ResourceRecords": [{"Value": "'"$PUBLIC_IP"'"}]
      }
    }]
  }'
```

## 주의사항

- 같은 서비스 이름으로 재배포하면 기존 프로세스를 교체합니다 (Zero-downtime 아님)
- SSL 인증서는 Caddy가 자동으로 Let's Encrypt에서 발급합니다
- DNS 전파에 최대 60초 소요될 수 있습니다
- 서비스 로그: `pm2 logs SERVICE_NAME`
- 서비스 모니터링: `pm2 monit`
