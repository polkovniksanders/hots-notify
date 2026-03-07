# ROADMAP: hots-notify bot

Документ для Claude Code. Задачи упорядочены по приоритету. Каждый раздел содержит контекст, конкретные требования и технические указания.

---

## Контекст проекта

**Стек:** Node.js, TypeScript, grammY, Prisma + SQLite, Twitch Helix API, PM2
**Бот:** [@hots_notify](https://t.me/hots_notify) — отслеживает RU-стримы HotS на Twitch, постит анонсы в Telegram-группу
**Текущий polling interval:** 600 секунд (10 минут)
**БД:** SQLite через Prisma
**Тесты:** vitest, 111 тестов, запускаются в deploy.sh перед build — падение останавливает деплой

---

## ✅ ВЫПОЛНЕНО

### Задача 1: Улучшенная фильтрация RU-стримов
Двойной запрос к Twitch API: `language=ru` + все стримы с кириллицей в тайтле или тегами `ru/russian/рус`. Дедупликация по `user_login`.

### Задача 2: Схлопывание сообщений "Стрим завершён"
Один polling-цикл = одно сообщение для всех завершившихся стримов. Одиночное завершение показывает длительность.

### Задача 3: Inline-кнопки + превью
Карточка стрима отправляется с фото-превью (байты, не URL — обходит кэш Telegram) и кнопками `▶️ Смотреть` / `🔔 Подписаться`.

### Задача 4: Система подписок `/follow`
`/follow <login>`, `/unfollow <login>`, `/follows`. При старте стрима — личное DM подписчикам. Обработка заблокированных ботов (авто-удаление подписки). Таблица `Subscription` в SQLite.

### Задача 5 (частично): Профили стримеров
Команды администратора `/set`, `/clear`, `/profile`, `/delprofile`. Поля: `description`, `discord`, `telegram`, `youtube`, `donate`. Автоматически добавляются в карточку стрима.

### Каналы стримеров (`/addchannel`)
Telegram-канал привязывается к стримеру через `/addchannel <chat_id> <login>`. При старте стрима бот постит уведомление в этот канал. Быстрый поллинг каждые 30 сек только для зарегистрированных стримеров (~15–30 сек задержка). Трекер общий с основным поллингом — двойные уведомления исключены. Автоудаление мёртвых каналов. Команды: `/addchannel`, `/removechannel`, `/listchannels`.

### Кастомные превью стримеров
`/setthumbnail <login>` (фото в подписи к сообщению) — сохраняет JPG на сервере в `data/thumbnails/`. `/clearthumbnail <login>` — удаляет. Поддерживаются как сжатые фото, так и файлы (документы). Кастомное превью имеет приоритет над Twitch-скриншотом.

### Качество кода и деплой
- Тесты: 128 тестов (vitest), 8 файлов — tracker, formatter, streams, profile, subscription, users, follow, channel
- `npm test` в `deploy.sh` перед build: падение тестов останавливает деплой
- Prisma миграции применяются автоматически при деплое
- `*.db` в `.gitignore` — БД не попадает в репозиторий

---

## ✅ ЗАДАЧА 6: Уменьшить polling interval

Выполнено вручную на сервере: `POLLING_INTERVAL=120` в `.env`. Задержка уведомлений сокращена с 10 минут до 2 минут.

---

## ЗАДАЧА 7: Миграция SQLite → PostgreSQL

### Когда делать
После реализации задачи 7. SQLite начнёт давать проблемы при concurrent writes.

### Изменения
- `provider = "postgresql"` в `prisma/schema.prisma`
- `DATABASE_URL` в `.env` → строка подключения PostgreSQL
- Скрипт миграции данных из SQLite

---

## ЗАДАЧА 8: Twitch EventSub — мгновенные уведомления (<5 сек)

### Цель
Заменить быстрый поллинг (30 сек) на push-уведомления от Twitch. Twitch сам вызывает наш вебхук в момент начала стрима.

### Архитектура после реализации
```
Стримеры с каналом → EventSub stream.online → webhook → ~5 сек задержка
Остальные RU-стримеры → polling каждые 120 сек
```

### Предварительные требования на сервере
```bash
# 1. Установить nginx
apt install nginx

# 2. Получить TLS-сертификат (Let's Encrypt)
apt install certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com

# 3. Настроить nginx reverse proxy
# /etc/nginx/sites-available/hots-notify:
server {
    listen 443 ssl;
    server_name yourdomain.com;

    location /webhook/twitch {
        proxy_pass http://localhost:3000;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

### Новые переменные окружения
```env
PUBLIC_URL=https://yourdomain.com   # публичный URL сервера
EVENTSUB_SECRET=random_32_char_string  # секрет для верификации Twitch
PORT=3000                              # порт Express (уже есть в стеке)
```

### Изменения в схеме БД
```prisma
model ChannelSubscription {
  chatId         BigInt   @id
  streamerLogin  String
  twitchUserId   String?  // Twitch broadcaster ID (нужен для EventSub)
  eventSubId     String?  // ID подписки EventSub (для отмены при /removechannel)
  createdAt      DateTime @default(now())
}
```

### Новые файлы

**`src/eventsub/verify.ts`** — верификация подписи Twitch:
```typescript
import crypto from 'crypto';

export function verifyTwitchSignature(
  body: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const msgId = headers['twitch-eventsub-message-id'];
  const timestamp = headers['twitch-eventsub-message-timestamp'];
  const signature = headers['twitch-eventsub-message-signature'];
  const hmac = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(msgId + timestamp + body)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
}
```

**`src/eventsub/register.ts`** — регистрация/отмена подписки в Twitch:
```typescript
// Вызывается при /addchannel — подписывает на stream.online для стримера
export async function registerStreamOnline(broadcasterId: string): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: {
      'Client-ID': config.twitchClientId,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'stream.online',
      version: '1',
      condition: { broadcaster_user_id: broadcasterId },
      transport: {
        method: 'webhook',
        callback: `${config.publicUrl}/webhook/twitch`,
        secret: config.eventSubSecret,
      },
    }),
  });
  const data = await res.json();
  return data.data[0].id; // EventSub subscription ID
}

// Вызывается при /removechannel
export async function deleteEventSubSubscription(eventSubId: string): Promise<void> {
  const token = await getAccessToken();
  await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${eventSubId}`, {
    method: 'DELETE',
    headers: {
      'Client-ID': config.twitchClientId,
      'Authorization': `Bearer ${token}`,
    },
  });
}
```

**`src/eventsub/webhook.ts`** — Express endpoint:
```typescript
import express from 'express';
import { verifyTwitchSignature } from './verify';
import { config } from '../config';

export const webhookRouter = express.Router();

// Twitch требует raw body для верификации подписи
webhookRouter.post('/webhook/twitch', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!verifyTwitchSignature(req.body, req.headers as Record<string, string>, config.eventSubSecret)) {
    return res.status(403).send('Forbidden');
  }

  const body = JSON.parse(req.body.toString());
  const msgType = req.headers['twitch-eventsub-message-type'];

  // Twitch verification challenge при создании подписки
  if (msgType === 'webhook_callback_verification') {
    return res.status(200).send(body.challenge);
  }

  if (msgType === 'notification' && body.subscription.type === 'stream.online') {
    const login = body.event.broadcaster_user_login;
    // Запускаем обработку в фоне, не блокируем ответ Twitch
    handleStreamOnline(login).catch(console.error);
  }

  res.status(204).send();
});
```

### Изменения в `/addchannel`
```typescript
// При добавлении канала:
// 1. Получить Twitch user ID по логину (уже есть getTwitchUser)
// 2. Зарегистрировать EventSub подписку
// 3. Сохранить eventSubId и twitchUserId в ChannelSubscription
const twitchUser = await getTwitchUser(streamerLogin);
const eventSubId = await registerStreamOnline(twitchUser.id);
await addChannelSubscription(chatId, streamerLogin, twitchUser.id, eventSubId);
```

### Взаимодействие с существующим fast poll
После реализации EventSub fast poll для зарегистрированных стримеров можно убрать — он уже не нужен. Или оставить как fallback на случай временной недоступности вебхука.

---

## Порядок реализации

| # | Задача | Сложность | Ценность | Статус |
|---|--------|-----------|----------|--------|
| 1 | Polling + RU-фильтр | низкая | высокая | ✅ Готово |
| 2 | Схлопнуть "завершён" | низкая | средняя | ✅ Готово |
| 3 | Inline-кнопки + превью | средняя | высокая | ✅ Готово |
| 4 | `/follow` подписки | средняя | высокая | ✅ Готово |
| 5 | Профили стримеров | средняя | высокая | ✅ Частично (admin-only) |
| 6 | Polling interval 2 мин | низкая | высокая | ✅ Готово |
| 7 | SQLite → PostgreSQL | низкая | средняя | запланировано |
| 8 | EventSub | высокая | средняя | последней |

---

## Переменные окружения (`.env.example`)

```env
BOT_TOKEN=                    # Telegram bot token
BOT_NAME=                     # Telegram bot username (без @)
CHANNEL_ID=                   # Telegram group/channel ID
ADMIN_ID=                     # Telegram user ID администратора

TWITCH_APP_CLIENT=            # Twitch Client ID
TWITCH_APP_SECRET=            # Twitch Client Secret

POLLING_INTERVAL=600          # Интервал опроса в секундах
DIGEST_HOUR=21                # Час дайджеста по UTC (= 00:00 МСК при +3)

GPTUNNEL_API_KEY=             # API-ключ для AI-приветствий (опционально)
GPTUNNEL_BASE_URL=            # Base URL (опционально)

# Задача 9 (EventSub):
# PUBLIC_URL=                 # Публичный HTTPS URL сервера
# EVENTSUB_SECRET=            # Секрет для верификации webhook
```

---

## Заметки по архитектуре

- **Не использовать `any` в TypeScript** — типизировать ответы Twitch API через интерфейсы
- **Тесты обязательны** для новой логики — минимум happy path + edge cases + HTML escaping
- **Rate limiting уведомлений:** при росте подписчиков использовать очередь (p-queue) вместо `Promise.allSettled`
- **Health check endpoint:** добавить `GET /health` возвращающий статус polling и время последнего запроса к Twitch API
- **Логировать ошибки отправки** с user_id — помогает отлаживать заблокированных ботом пользователей
