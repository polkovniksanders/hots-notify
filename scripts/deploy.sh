#!/bin/bash
# Обновление бота на VPS после изменений в репозитории
# Запускать из директории /var/www/hots-notify

set -e

APP_DIR="$HOME/hots_notify"

cd "$APP_DIR"

echo "==> Pulling latest changes..."
git fetch origin
git checkout -- package-lock.json 2>/dev/null || true
git merge --ff-only origin/master

echo "==> Installing dependencies..."
npm install

echo "==> Applying database migrations..."
npx prisma migrate deploy

echo "==> Building..."
npm run build

echo "==> Restarting bot..."
pm2 restart hots-notify

echo "==> Done! Bot status:"
pm2 status hots-notify
