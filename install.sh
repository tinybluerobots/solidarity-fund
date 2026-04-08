#!/usr/bin/env bash
set -euo pipefail

# ── Parameters ──────────────────────────────────────────────────────
SSH_TARGET="${1:?Usage: ./install.sh <user@host>}"
shift || true

# Defaults (override via env)
APP_NAME="${APP_NAME:-csf}"
DATA_DIR="${DATA_DIR:-/var/lib/$APP_NAME}"
PORT="${PORT:-80}"

# Optional config
FUND_NAME="${FUND_NAME:-Community Solidarity Fund}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$DATA_DIR/.env"
IMAGE="ghcr.io/tinybluerobots/solidarity-fund:latest"

# ── Preserve existing config from remote .env ─────────────────────
EXISTING_ENV=$(ssh "$SSH_TARGET" "cat '$ENV_FILE' 2>/dev/null" || true)
if [ -n "$EXISTING_ENV" ]; then
	# Use existing values as defaults (can still be overridden via env)
	ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(echo "$EXISTING_ENV" | grep '^ADMIN_PASSWORD=' | sed 's/^ADMIN_PASSWORD=//' | tr -d "'")}"
	ALTCHA_HMAC_KEY="${ALTCHA_HMAC_KEY:-$(echo "$EXISTING_ENV" | grep '^ALTCHA_HMAC_KEY=' | sed 's/^ALTCHA_HMAC_KEY=//' | tr -d "'")}"
	FUND_NAME="${FUND_NAME:-$(echo "$EXISTING_ENV" | grep '^FUND_NAME=' | sed 's/^FUND_NAME=//' | tr -d "'")}"
	PORT="${PORT:-$(echo "$EXISTING_ENV" | grep '^PORT=' | sed 's/^PORT=//' | tr -d "'")}"
fi

# Auto-generate secrets if still not set (first install)
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 32)}"
ALTCHA_HMAC_KEY="${ALTCHA_HMAC_KEY:-$(openssl rand -base64 32)}"

if [ -n "$EXISTING_ENV" ]; then
	echo "==> Reusing existing secrets from remote .env"
else
	echo "==> Generated NEW secrets (save these!):"
	echo "    ADMIN_PASSWORD=$ADMIN_PASSWORD"
	echo "    ALTCHA_HMAC_KEY=$ALTCHA_HMAC_KEY"
fi

# ── Write env file to remote first ─────────────────────────────────
ssh "$SSH_TARGET" "mkdir -p '$DATA_DIR'"
ssh "$SSH_TARGET" "cat > '$ENV_FILE' && chmod 600 '$ENV_FILE'" <<EOF
APP_NAME='${APP_NAME//\'/\'\\\'\'}'
DATA_DIR='${DATA_DIR//\'/\'\\\'\'}'
PORT='${PORT//\'/\'\\\'\'}'
FUND_NAME='${FUND_NAME//\'/\'\\\'\'}'
ADMIN_PASSWORD='${ADMIN_PASSWORD//\'/\'\\\'\'}'
ALTCHA_HMAC_KEY='${ALTCHA_HMAC_KEY//\'/\'\\\'\'}'
IMAGE='${IMAGE//\'/\'\\\'\'}'
NODE_ENV=production
EOF

# ── Copy compose file ──────────────────────────────────────────────
scp "$SCRIPT_DIR/docker-compose.yml" "$SSH_TARGET:$DATA_DIR/docker-compose.yml"

# ── Remote setup (reads config from env file) ──────────────────────
ssh "$SSH_TARGET" "ENV_FILE='$ENV_FILE' bash" <<'REMOTE'
set -euo pipefail
set -a; source "$ENV_FILE"; set +a
export DEBIAN_FRONTEND=noninteractive

# ── Docker ──────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

# ── Pull image ──────────────────────────────────────────────────────
echo "==> Pulling $IMAGE..."
docker pull "$IMAGE"

# ── Start containers ───────────────────────────────────────────────
cd "$DATA_DIR"
docker compose down 2>/dev/null || true
docker compose up -d

echo ""
echo "==> $APP_NAME is running on port $PORT"
docker compose ps

echo ""
echo "==> TO UPGRADE:"
echo "    Run this script again — pulls latest image and restarts."
REMOTE

echo "==> Done. $APP_NAME deployed to $SSH_TARGET"