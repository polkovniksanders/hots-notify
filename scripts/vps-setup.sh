#!/bin/bash
# Первоначальная настройка VPS Beget
# Запускать один раз после подключения по SSH

set -e

REPO_URL=$1
APP_DIR="$HOME/hots_notify"

if [ -z "$REPO_URL" ]; then
  echo "Usage: bash vps-setup.sh <git-repo-url>"
  echo "Example: bash vps-setup.sh https://github.com/yourname/hots-notify.git"
  exit 1
fi

echo "==> Installing nvm..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"

echo "==> Installing Node.js LTS..."
nvm install --lts
nvm use --lts
nvm alias default node

echo "==> Installing PM2..."
npm install -g pm2

echo "==> Cloning repository..."
git clone "$REPO_URL" "$APP_DIR"
cd "$APP_DIR"

echo "==> Creating .env..."
cp .env.example .env
echo ""
echo "!!! Fill in the .env file before starting the bot !!!"
echo "Run: nano $APP_DIR/.env"
echo ""

echo "==> Installing dependencies..."
npm install

echo "==> Building..."
npm run build

echo "==> Applying database migrations..."
npx prisma migrate deploy

echo "==> Setup complete!"
echo ""
echo "Next steps:"
echo "  1. nano $APP_DIR/.env       — fill in tokens (BOT_TOKEN, CHANNEL_ID, TWITCH_*, DATABASE_URL, ADMIN_ID)"
echo "  2. cd $APP_DIR && pm2 start dist/index.js --name hots-notify"
echo "  3. pm2 save && pm2 startup  — enable autostart"
