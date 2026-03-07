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

### Сервер

- **SSH:** `root@155.212.131.33`
- **Путь проекта:** `$HOME/hots_notify` (т.е. `/root/hots_notify`)
- **PM2 app name:** `hots-notify`
- **OS:** Linux (Beget VPS)
- **Node.js:** LTS через nvm (`~/.nvm`)

### Деплой (основной способ)

Запускать локально или на сервере из папки проекта:

```bash
ssh root@155.212.131.33
cd ~/hots_notify
bash scripts/deploy.sh
```

Скрипт выполняет последовательно:
1. `git fetch && git merge --ff-only origin/master` — обновление кода
2. `npm install` — зависимости
3. `npx prisma generate` — клиент Prisma
4. `npx prisma migrate deploy` — миграции БД (prod)
5. `npm test` — тесты (при падении деплой останавливается)
6. `npm run build` — компиляция TypeScript → `dist/`
7. `pm2 restart hots-notify` — перезапуск процесса

### Первоначальная настройка (один раз)

```bash
ssh root@155.212.131.33
bash <(curl -s <repo-url>/scripts/vps-setup.sh) <git-repo-url>
nano ~/hots_notify/.env          # заполнить токены
cd ~/hots_notify
pm2 start dist/index.js --name hots-notify
pm2 save && pm2 startup
```

### Управление PM2

```bash
pm2 logs hots-notify            # логи в реальном времени
pm2 status hots-notify          # статус процесса
pm2 restart hots-notify         # перезапуск без деплоя
pm2 stop hots-notify            # остановка
```

### БД и миграции

- SQLite, файл: `~/hots_notify/prisma/dev.db` (prod использует тот же файл)
- При добавлении поля в схему: добавить миграцию локально (`prisma migrate dev`), закоммитить, деплой применит её через `prisma migrate deploy`
- Перед опасными миграциями сделать бэкап: `cp ~/hots_notify/prisma/dev.db ~/hots_notify/prisma/dev.db.bak`

### Кастомные превью стримеров

Файлы хранятся на сервере в `~/hots_notify/data/thumbnails/<login>.jpg`. Не попадают в git (добавить в `.gitignore` при необходимости).

## Notification Format (example)

```
🎮 Новый стрим — Heroes of the Storm
👤 StreamerName
📺 Название трансляции
👥 1 234 зрителя
🔗 https://twitch.tv/streamername
```
