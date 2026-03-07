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
| `BOT_NAME` | Username бота (без @) |
| `CHANNEL_ID` | ID канала или группы для уведомлений |
| `TWITCH_APP_CLIENT` | Client ID Twitch-приложения |
| `TWITCH_APP_SECRET` | Client Secret Twitch-приложения |
| `POLLING_INTERVAL` | Интервал опроса в секундах (по умолчанию `600`) |
| `DIGEST_HOUR` | Час отправки дайджеста по UTC (по умолчанию `21`, = 00:00 МСК) |
| `DATABASE_URL` | Путь к SQLite-базе (по умолчанию `file:./hots-notify.db`) |
| `ADMIN_ID` | Telegram user ID администратора |
| `GPTUNNEL_API_KEY` | API-ключ gpttunnel.com для AI-приветствий (опционально) |

## Команды бота

### Публичные (работают в любом чате)

| Команда | Описание |
|---|---|
| `/stats` | Статистика стримов за текущий день |
| `/follow <twitch_login>` | Подписаться на стримера — получать личные уведомления о старте стрима |
| `/unfollow <twitch_login>` | Отписаться от стримера |
| `/follows` | Список текущих подписок |

> `/follow`, `/unfollow`, `/follows` работают только в личном чате с ботом.

### Администратора (только в личке, только от `ADMIN_ID`)

| Команда | Описание |
|---|---|
| `/set <login> <поле> <значение>` | Установить поле профиля стримера |
| `/clear <login> <поле>` | Очистить поле профиля |
| `/profile <login>` | Показать текущий профиль стримера |
| `/delprofile <login>` | Удалить профиль стримера полностью |
| `/setthumbnail <login>` | Установить кастомное превью — отправить фото с этой подписью |
| `/clearthumbnail <login>` | Удалить кастомное превью, вернуться к Twitch-превью |
| `/addchannel <chat_id> <twitch_login>` | Привязать Telegram-канал к стримеру |
| `/removechannel <chat_id>` | Отвязать канал |
| `/listchannels` | Список всех привязанных каналов |

#### Поля профиля (`/set`, `/clear`)

| Поле | Тип | Описание |
|---|---|---|
| `description` | текст | Произвольное описание, отображается в посте |
| `discord` | URL | Ссылка на Discord-сервер |
| `telegram` | URL | Ссылка на Telegram-канал или группу |
| `youtube` | URL | Ссылка на YouTube-канал |
| `donate` | URL | Ссылка на страницу доната |

Поля `discord`, `telegram`, `youtube`, `donate` проверяются на валидный http/https URL. Профиль автоматически подтягивается при каждом новом стриме.

**Примеры:**

```
/set zloyeugene description Топовый игрок, стримит HotS с 2015 года
/set zloyeugene discord https://discord.gg/xxxxxxx
/set zloyeugene youtube https://youtube.com/@zloyeugene
/clear zloyeugene donate
/profile zloyeugene
/delprofile zloyeugene
```

#### Каналы стримеров (`/addchannel`)

Позволяет привязать Telegram-канал к конкретному стримеру. Бот будет слать уведомления о его стримах только в этот канал (дополнительно к основному каналу).

**Настройка:**
1. Добавь бота в канал стримера с правом публиковать сообщения
2. Перешли любое сообщение из этого канала в ЛС боту — он ответит `chat_id`
3. `/addchannel -1001234567890 zloyeugene`

Бот использует **быстрый поллинг каждые 30 сек** только для зарегистрированных стримеров — задержка уведомления ~15–30 сек вместо 2 минут. Общий трекер исключает двойные уведомления в основной канал.

Если бот был кикнут из канала — подписка удаляется автоматически.

#### Кастомное превью (`/setthumbnail`)

Отправьте фото с подписью `/setthumbnail <login>` прямо в Telegram-чат с ботом. Принимаются как сжатые фото, так и файлы (документы).

- Рекомендуемый размер: **1280×720** (16:9)
- Файл сохраняется в `data/thumbnails/<login>.jpg` на сервере
- Если кастомного превью нет — используется актуальный скриншот с Twitch (скачивается при каждом уведомлении, кэш Telegram не используется)

```
/clearthumbnail zloyeugene   — вернуться к Twitch-превью
```

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
ssh root@<server>
cd ~/hots_notify
bash scripts/deploy.sh
```

Скрипт автоматически выполняет:
`git pull` → `npm install` → `prisma generate` → `prisma migrate deploy` → **`npm test`** → `npm run build` → `pm2 restart`

> Если тесты падают — деплой останавливается, бот не перезапускается.

> Если тесты падают — деплой останавливается, бот не перезапускается.

### Управление

```bash
pm2 logs hots-notify      # просмотр логов
pm2 restart hots-notify   # перезапуск
pm2 stop hots-notify      # остановка
```

## Разработка

```bash
npm run dev    # запуск с hot-reload (ts-node-dev)
npm test       # запуск тестов (vitest)
npm run build  # компиляция TypeScript → dist/
```

После изменения схемы БД:
```bash
npx prisma migrate dev --name <название_изменения>
npx prisma generate
```
