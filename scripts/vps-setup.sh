#!/bin/bash
set -e

# Запускать из папки, куда уже склонирован репозиторий:
#   cd ~/hots_notify
#   bash scripts/vps-setup.sh

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."
NODE_MAJOR=22

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

if [ "$(id -u)" -ne 0 ]; then
  log_error "Run as root: sudo bash scripts/vps-setup.sh"
  exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}    INITIAL SERVER SETUP${NC}"
echo -e "${BLUE}    App dir: $APP_DIR${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. System packages
log_info "Updating system packages..."
apt-get update -qq
apt-get install -y -qq curl git python3 build-essential
log_success "System packages ready"

# 2. Node.js
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt "$NODE_MAJOR" ]; then
  log_info "Installing Node.js $NODE_MAJOR LTS..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
  log_success "Node.js installed: $(node -v)"
else
  log_success "Node.js already installed: $(node -v)"
fi

# 3. PM2
if ! command -v pm2 &> /dev/null; then
  log_info "Installing PM2..."
  npm install -g pm2
  log_success "PM2 installed: $(pm2 -v)"
else
  log_success "PM2 already installed: $(pm2 -v)"
fi

# 4. PM2 autostart on boot
log_info "Configuring PM2 startup on boot..."
pm2 startup systemd -u root --hp /root | tail -1 | bash || true
log_success "PM2 startup configured"

# 5. Create data directory (not tracked by git)
mkdir -p "$APP_DIR/data"
log_success "data/ directory ready"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}    SETUP COMPLETED${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
log_warn "Следующие шаги:"
echo ""
echo "  1. Создать .env файл:"
echo "     nano $APP_DIR/.env"
echo ""
echo "     Обязательные переменные:"
echo "       BOT_TOKEN=..."
echo "       BOT_NAME=..."
echo "       CHANNEL_ID=..."
echo "       TWITCH_APP_NAME=..."
echo "       TWITCH_APP_CLIENT=..."
echo "       TWITCH_APP_SECRET=..."
echo "       POLLING_INTERVAL=600"
echo "       DATABASE_URL=file:./hots-notify.db"
echo "       ADMIN_ID=..."
echo ""
echo "  2. Задеплоить:"
echo "     bash $APP_DIR/scripts/deploy.sh"
echo ""
echo "  3. Запустить бот (только первый раз, после деплоя):"
echo "     pm2 start $APP_DIR/dist/index.js --name hots-notify && pm2 save"
echo ""
