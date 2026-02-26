# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`hots-notify` — Telegram-бот на Node.js + TypeScript, который периодически опрашивает Twitch Helix API на наличие новых русскоязычных трансляций в категории Heroes of the Storm и отправляет уведомление в Telegram-канал или группу при появлении нового стрима.

## Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express (для webhook или healthcheck)
- **Bot**: grammY (Telegram Bot API)
- **Twitch API**: Twitch Helix API (`/helix/streams`)

## Commands

```bash
npm install          # Установка зависимостей
npm run build        # Компиляция TypeScript → dist/
npm run dev          # Запуск в режиме разработки (ts-node-dev / nodemon)
npm start            # Запуск dist/index.js
npm test             # Запуск тестов
```

## Environment Variables

| Variable | Description |
|---|---|
| `BOT_TOKEN` | Токен Telegram-бота (от @BotFather) |
| `BOT_NAME` | Username бота |
| `CHANNEL_ID` | ID канала или группы для уведомлений |
| `TWITCH_APP_NAME` | Название Twitch-приложения |
| `TWITCH_APP_CLIENT` | Client ID Twitch-приложения |
| `TWITCH_APP_SECRET` | Client Secret Twitch-приложения |
| `POLLING_INTERVAL` | Интервал опроса в секундах (рекомендуется `300`) |

## Twitch API

- Авторизация: **App Access Token** (Client Credentials Flow) — `POST https://id.twitch.tv/oauth2/token`
- Получение стримов: `GET /helix/streams?game_id=138585&language=ru&first=100`
- Документация: https://dev.twitch.tv/docs/api/reference/#get-streams

## Architecture

```
src/
  index.ts          # Точка входа: запуск polling-цикла и Telegram-бота
  config.ts         # Загрузка и валидация env-переменных
  twitch/
    auth.ts         # Получение и обновление App Access Token
    streams.ts      # Запрос /helix/streams, фильтрация по language=ru
  telegram/
    bot.ts          # Инициализация grammY Bot, функция отправки уведомления
    formatter.ts    # Форматирование сообщения о стриме
  tracker.ts        # Хранение виденных stream_id, определение новых стримов
```

## Core Flow

1. При старте получаем App Access Token у Twitch.
2. Каждые `POLLING_INTERVAL` секунд запрашиваем `/helix/streams?game_id=138585&language=ru`.
3. Сравниваем `stream.id` с уже виденными (in-memory Set или файл/БД).
4. Для каждого нового стрима отправляем сообщение в `CHANNEL_ID`.
5. Токен обновляем автоматически при истечении.

## Deployment (Beget VPS)

### Первоначальная настройка

```bash
# Установка Node.js через nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install --lts
nvm use --lts

# Установка PM2 (менеджер процессов)
npm install -g pm2
```

### Загрузка проекта

```bash
# Клонировать репозиторий или загрузить файлы через SFTP
git clone <repo-url> /var/www/hots-notify
cd /var/www/hots-notify

# Создать .env с переменными (скопировать и заполнить)
cp .env.example .env
nano .env

npm install
npm run build
```

### Запуск через PM2

```bash
pm2 start dist/index.js --name hots-notify
pm2 save                        # Сохранить список процессов
pm2 startup                     # Автозапуск после перезагрузки VPS
```

### Управление

```bash
pm2 logs hots-notify            # Просмотр логов
pm2 restart hots-notify         # Перезапуск
pm2 stop hots-notify            # Остановка

# Обновление бота
git pull
npm run build
pm2 restart hots-notify
```

## Notification Format (example)

```
🎮 Новый стрим — Heroes of the Storm
👤 StreamerName
📺 Название трансляции
👥 1 234 зрителя
🔗 https://twitch.tv/streamername
```
