#!/bin/bash
set -e

# Определяем папку проекта по расположению скрипта
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

timestamp() { date "+%Y-%m-%d %H:%M:%S"; }
log_info()    { echo -e "${BLUE}[$(timestamp)]${NC} $1"; }
log_success() { echo -e "${GREEN}[$(timestamp)]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[$(timestamp)]${NC} $1"; }
log_error()   { echo -e "${RED}[$(timestamp)]${NC} $1"; }

on_error() {
  log_error "Deployment failed at step: $1"
  log_error "Rolling back to previous state..."

  if [ -d "$APP_DIR/dist.backup" ]; then
    rm -rf "$APP_DIR/dist"
    mv "$APP_DIR/dist.backup" "$APP_DIR/dist"
    log_warn "Restored previous build from backup"
  fi

  if command -v pm2 &> /dev/null && [ -d "$APP_DIR/dist" ]; then
    pm2 restart hots-notify 2>/dev/null || true
    log_warn "PM2 restarted with previous build"
  fi

  exit 1
}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}    PRODUCTION DEPLOYMENT${NC}"
echo -e "${BLUE}    Target: $APP_DIR${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 0. Pre-flight checks
log_info "Running pre-flight checks..."

NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 20 ]; then
  log_error "Node.js >= 20 is required. Current: $(node -v 2>/dev/null || echo 'not installed')"
  exit 1
fi
log_success "Node.js version: $(node -v)"

if ! command -v pm2 &> /dev/null; then
  log_error "PM2 is not installed. Run: npm install -g pm2"
  exit 1
fi
log_success "PM2 version: $(pm2 -v)"

if [ ! -d "$APP_DIR" ]; then
  log_error "App directory $APP_DIR does not exist."
  exit 1
fi
log_success "App directory: $APP_DIR"

# 1. Pull latest changes
log_info "Pulling latest code from origin/master..."
cd "$APP_DIR"
git fetch origin master || on_error "git fetch"
git reset --hard origin/master || on_error "git reset"

# 2. Load environment variables
log_info "Loading .env variables..."
if [ -f "$APP_DIR/.env" ]; then
  set -a
  source "$APP_DIR/.env"
  set +a
  log_success ".env loaded"
else
  log_error ".env file not found at $APP_DIR/.env"
  exit 1
fi

REQUIRED_VARS=("BOT_TOKEN" "TWITCH_APP_CLIENT" "TWITCH_APP_SECRET")
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    log_error "Required environment variable $var is not set"
    exit 1
  fi
done
log_success "Required environment variables validated"

# 3. Ensure data directory exists (not in git)
if [ ! -d "$APP_DIR/data" ]; then
  mkdir -p "$APP_DIR/data"
  log_success "Created data/ directory"
fi

# 4. Backup current build
if [ -d "$APP_DIR/dist" ]; then
  log_info "Backing up current build..."
  rm -rf "$APP_DIR/dist.backup"
  cp -r "$APP_DIR/dist" "$APP_DIR/dist.backup"
  log_success "Backup created: dist.backup"
fi

# 5. Clean old build
log_info "Cleaning old build..."
rm -rf "$APP_DIR/dist"

# 6. Install dependencies
log_info "Installing dependencies (dev included)..."
NODE_ENV=development npm ci || on_error "npm ci"
log_success "Dependencies installed"

# 7. Generate Prisma client
log_info "Generating Prisma client..."
npx prisma generate || on_error "prisma generate"
log_success "Prisma client generated"

# 8. Apply database migrations
log_info "Applying database migrations..."
npx prisma migrate deploy || on_error "prisma migrate deploy"
log_success "Migrations applied"

# 9. Type check
log_info "Running type check..."
npx tsc --noEmit || on_error "typecheck"
log_success "Type check passed"

# 10. Run tests
log_info "Running tests..."
npm test || on_error "tests"
log_success "Tests passed"

# 11. Build project
log_info "Building project..."
npm run build || on_error "build"
log_success "Build completed"

# 12. Remove dev dependencies
log_info "Removing dev dependencies..."
npm prune --omit=dev
log_success "Dev dependencies removed"

# 13. Restart PM2
log_info "Restarting PM2..."
pm2 restart hots-notify || on_error "pm2 restart"
pm2 save
log_success "PM2 restarted and saved"

# 14. Health check
log_info "Running health check (waiting 5s)..."
sleep 5

BOT_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
procs = json.load(sys.stdin)
bot = next((p for p in procs if p['name'] == 'hots-notify'), None)
print(bot['pm2_env']['status'] if bot else 'not_found')
" 2>/dev/null || echo "unknown")

if [ "$BOT_STATUS" = "online" ]; then
  log_success "Health check passed — bot is online"
else
  log_warn "Bot status: $BOT_STATUS — check logs with: pm2 logs hots-notify --lines 50"
fi

# 15. Cleanup backup on success
if [ -d "$APP_DIR/dist.backup" ]; then
  rm -rf "$APP_DIR/dist.backup"
  log_info "Backup cleaned up"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}    DEPLOYMENT COMPLETED${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

log_info "PM2 status:"
pm2 status

echo ""
log_info "Recent logs (last 20 lines):"
pm2 logs hots-notify --lines 20 --nostream
