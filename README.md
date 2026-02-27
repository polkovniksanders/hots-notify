# hots-notify

Telegram-бот на Node.js + TypeScript. Следит за новыми русскоязычными трансляциями Heroes of the Storm на Twitch и отправляет уведомления в Telegram-канал.

## Быстрый старт

```bash
npm install
cp .env.example .env
# заполнить .env
npx prisma migrate deploy
npm run build
npm start
```

## Переменные окружения

| Переменная | Описание |
|---|---|
| `BOT_TOKEN` | Токен Telegram-бота (от @BotFather) |
| `BOT_NAME` | Username бота |
| `CHANNEL_ID` | ID канала или группы для уведомлений |
| `TWITCH_APP_CLIENT` | Client ID Twitch-приложения |
| `TWITCH_APP_SECRET` | Client Secret Twitch-приложения |
| `POLLING_INTERVAL` | Интервал опроса в секундах (по умолчанию `600`) |
| `DIGEST_HOUR` | Час отправки дайджеста по UTC (по умолчанию `21`, = 00:00 МСК) |
| `DATABASE_URL` | Путь к SQLite-базе (по умолчанию `file:./hots-notify.db`) |
| `ADMIN_ID` | Telegram user ID администратора (для управления профилями) |

## Команды бота

### Публичные

| Команда | Описание |
|---|---|
| `/stats` | Статистика стримов за текущий день |

### Администратора (только в личке с ботом)

Все команды работают только в личном чате с ботом и только от пользователя с `ADMIN_ID`.

| Команда | Описание |
|---|---|
| `/set <username> <поле> <значение>` | Установить поле профиля стримера |
| `/clear <username> <поле>` | Очистить поле профиля |
| `/profile <username>` | Показать текущий профиль стримера |
| `/delprofile <username>` | Удалить профиль стримера полностью |

**Доступные поля:**

| Поле | Тип | Описание |
|---|---|---|
| `description` | текст | Произвольное описание, отображается в посте |
| `discord` | URL | Ссылка на Discord-сервер |
| `telegram` | URL | Ссылка на Telegram-канал или группу |
| `youtube` | URL | Ссылка на YouTube-канал |
| `donate` | URL | Ссылка на страницу доната |

**Примеры:**

```
/set zloyeugene description Топовый игрок, стримит HotS с 2015 года
/set zloyeugene discord https://discord.gg/xxxxxxx
/set zloyeugene youtube https://youtube.com/@zloyeugene
/set zloyeugene donate https://donate.stream/zloyeugene
/clear zloyeugene donate
/profile zloyeugene
/delprofile zloyeugene
```

Поля `discord`, `telegram`, `youtube`, `donate` проверяются на валидный http/https URL. Профиль подтягивается автоматически при каждом новом стриме стримера.

## Деплой на VPS

### Первоначальная настройка

```bash
bash scripts/vps-setup.sh https://github.com/yourname/hots-notify.git
nano ~/hots_notify/.env   # заполнить все переменные
cd ~/hots_notify
pm2 start dist/index.js --name hots-notify
pm2 save && pm2 startup
```

### Обновление

```bash
cd ~/hots_notify
bash scripts/deploy.sh
```

Скрипт автоматически выполняет: `git pull` → `npm install` → `prisma migrate deploy` → `npm run build` → `pm2 restart`.

### Управление

```bash
pm2 logs hots-notify      # просмотр логов
pm2 restart hots-notify   # перезапуск
pm2 stop hots-notify      # остановка
```

## Разработка

```bash
npm run dev   # запуск с hot-reload (ts-node-dev)
npm run build # компиляция TypeScript → dist/
```

После изменения схемы БД:
```bash
npx prisma migrate dev --name <название_изменения>
npx prisma generate
```
