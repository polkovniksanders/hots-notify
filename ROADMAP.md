# ROADMAP: hots-notify bot

Документ для Claude Code. Задачи упорядочены по приоритету. Каждый раздел содержит контекст, конкретные требования и технические указания.

---

## Контекст проекта

**Стек:** Node.js, TypeScript, grammY, Prisma + SQLite, Twitch Helix API, PM2  
**Бот:** [@hots_notify](https://t.me/hots_notify) — отслеживает RU-стримы HotS на Twitch, постит анонсы в Telegram-группу  
**Текущий polling interval:** 600 секунд (10 минут) — слишком долго  
**БД:** SQLite через Prisma

---

## ЗАДАЧА 1: Уменьшить polling interval + оптимизировать определение RU-стримов

### Цель
Сократить задержку уведомления с 10 минут до 2 минут. Улучшить охват RU-стримеров.

### Изменения

**1.1 Изменить `POLLING_INTERVAL` по умолчанию**

В `.env.example` и в коде где задаётся дефолт:
```
POLLING_INTERVAL=120  # было 600
```

**1.2 Улучшить фильтрацию RU-стримов**

Текущий запрос к Twitch API, скорее всего, использует только `language=ru`. Нужно расширить логику:

```typescript
// src/services/twitch.ts (или где находится логика опроса)

async function fetchRuHotsStreams(): Promise<TwitchStream[]> {
  // Запрос 1: официальный RU-язык канала
  const ruStreams = await fetchStreams({ game_id: HOTS_GAME_ID, language: 'ru' })
  
  // Запрос 2: все стримы категории (для поиска стримеров без language=ru)
  const allStreams = await fetchStreams({ game_id: HOTS_GAME_ID, first: '100' })
  
  // Фильтр по кириллице в тайтле или тегу 'ru'/'russian'
  const additionalRu = allStreams.filter(stream => {
    if (ruStreams.some(s => s.user_id === stream.user_id)) return false // дедупликация
    const hasRuTitle = /[а-яёА-ЯЁ]/.test(stream.title)
    const hasRuTag = stream.tags?.some(tag =>
      ['русский', 'russian', 'ru', 'рус'].includes(tag.toLowerCase())
    )
    return hasRuTitle || hasRuTag
  })
  
  return [...ruStreams, ...additionalRu]
}
```

**Важно:** Twitch Helix rate limit — 800 req/min для App Access Token. При 2-минутном интервале расход ~720 req/день — хорошо в пределах лимита.

---

## ЗАДАЧА 2: Убрать/схлопнуть сообщения "Стрим завершён"

### Проблема
Сейчас каждое завершение стрима постится отдельным сообщением в группу. При завершении нескольких стримов одновременно (конец вечернего прайма) — 4-6 сообщений подряд с голыми ссылками на офлайн-канал. Это мусор в ленте.

### Решение
Собирать завершённые стримы за один polling-цикл и постить одним сообщением:

```typescript
// Вместо отдельного сообщения на каждый завершённый стрим:

async function handleEndedStreams(endedStreams: Stream[]): Promise<void> {
  if (endedStreams.length === 0) return
  
  if (endedStreams.length === 1) {
    // Одиночное завершение — показать итог стрима
    const stream = endedStreams[0]
    const duration = formatDuration(stream.startedAt, new Date())
    const message = `⭕ Стрим завершён\n👤 ${stream.username}\n⏱ Был в эфире: ${duration}`
    await bot.api.sendMessage(CHANNEL_ID, message)
  } else {
    // Несколько завершений — одно компактное сообщение
    const names = endedStreams.map(s => s.username).join(', ')
    const message = `⭕ Завершили стрим: ${names}`
    await bot.api.sendMessage(CHANNEL_ID, message)
  }
}
```

**Альтернатива (проще):** полностью убрать сообщения о завершении стрима. Проверить реакцию аудитории через опрос в группе.

### Схема данных
Убедиться что в БД хранится `started_at` для расчёта длительности. Если нет — добавить миграцию:
```prisma
model Stream {
  // ... существующие поля
  startedAt DateTime @default(now())
}
```

---

## ЗАДАЧА 3: Inline-кнопки в карточке стрима

### Цель
Заменить голые ссылки в теле сообщения на кнопки под постом. Улучшает UX и CTR.

### Текущий вид
```
🔗 https://twitch.tv/username
```

### Целевой вид
Кнопки под сообщением:
```
[ ▶️ Смотреть ]  [ 🔔 Уведомлять меня ]
```

### Реализация (grammY)

```typescript
import { InlineKeyboard } from 'grammy'

function buildStreamKeyboard(username: string): InlineKeyboard {
  return new InlineKeyboard()
    .url('▶️ Смотреть', `https://twitch.tv/${username}`)
    .callbackButton('🔔 Уведомлять меня', `follow:${username}`)
}

// При отправке анонса:
await bot.api.sendPhoto(CHANNEL_ID, stream.thumbnailUrl, {
  caption: buildStreamCaption(stream),
  reply_markup: buildStreamKeyboard(stream.userLogin),
  parse_mode: 'HTML'
})
```

**Обработчик кнопки `follow:*` реализуется в ЗАДАЧЕ 4.**

### Фильтрация тегов в карточке
Текущая проблема: теги с Twitch типа `#depression #Hikikomori` попадают в пост.

```typescript
// Whitelist игровых/релевантных тегов
const RELEVANT_TAG_PATTERNS = [
  /heroes.?of.?the.?storm/i,
  /hots/i,
  /blizzard/i,
  /moba/i,
  /русский/i,
  /russian/i,
]

function filterTags(tags: string[]): string[] {
  return tags.filter(tag =>
    RELEVANT_TAG_PATTERNS.some(pattern => pattern.test(tag))
  )
}
```

---

## ЗАДАЧА 4: Система подписок `/follow` — личные уведомления

### Цель
Пользователь подписывается на конкретного стримера через личку с ботом. При старте стрима получает личное push-уведомление.

### Схема БД (новая миграция Prisma)

```prisma
model Subscription {
  id              Int      @id @default(autoincrement())
  userId          BigInt   // Telegram user_id
  streamerLogin   String   // Twitch login стримера (lowercase)
  createdAt       DateTime @default(now())
  
  @@unique([userId, streamerLogin])
  @@index([streamerLogin])
}
```

### Команды бота

```
/follow <twitch_username>   — подписаться на стримера
/unfollow <twitch_username> — отписаться
/follows                    — список моих подписок
```

### Реализация flow

```typescript
// src/commands/follow.ts

bot.command('follow', async (ctx) => {
  // Работает только в личке
  if (ctx.chat.type !== 'private') {
    await ctx.reply('Команда работает только в личном чате с ботом.')
    return
  }
  
  const login = ctx.match?.trim().toLowerCase()
  if (!login) {
    await ctx.reply('Укажи ник стримера: /follow username')
    return
  }
  
  // Проверить что стример существует на Twitch
  const twitchUser = await twitchClient.getUser(login)
  if (!twitchUser) {
    await ctx.reply(`Стример @${login} не найден на Twitch.`)
    return
  }
  
  await prisma.subscription.upsert({
    where: { userId_streamerLogin: { userId: BigInt(ctx.from.id), streamerLogin: login } },
    create: { userId: BigInt(ctx.from.id), streamerLogin: login },
    update: {}
  })
  
  await ctx.reply(`✅ Подписался! Уведомлю когда ${twitchUser.displayName} начнёт стрим.`)
})
```

### Отправка уведомлений подписчикам

```typescript
// В polling loop, после обнаружения нового стрима:

async function notifySubscribers(stream: TwitchStream): Promise<void> {
  const subs = await prisma.subscription.findMany({
    where: { streamerLogin: stream.userLogin.toLowerCase() }
  })
  
  for (const sub of subs) {
    try {
      await bot.api.sendMessage(
        Number(sub.userId),
        `🔴 ${stream.userName} начал стрим!\n${stream.title}\n\nhttps://twitch.tv/${stream.userLogin}`
      )
    } catch (e) {
      // Пользователь заблокировал бота — удалить подписку
      if (isBlockedByUser(e)) {
        await prisma.subscription.deleteMany({
          where: { userId: sub.userId }
        })
      }
    }
  }
}
```

**Важно:** уведомления отправлять параллельно через `Promise.allSettled`, не последовательно. При большом числе подписчиков — батчинг с задержкой (Telegram limit: 30 msg/sec).

---

## ЗАДАЧА 5: Self-service регистрация стримеров

### Цель
Убрать зависимость от ручного `/set` через ADMIN. Стример сам регистрируется через личку с ботом.

### Flow

```
Стример: /register
Бот: Введи свой Twitch-ник для верификации
Стример: zloyeugene
Бот: Проверяю... ✅ Найден канал "ZloyEugene"
     Теперь заполни профиль (необязательно):
     [📝 Описание] [💬 Discord] [📱 Telegram] [▶️ YouTube] [💰 Донат]
     [✅ Готово]
```

### Реализация через grammY Conversations или FSM

Использовать `@grammyjs/conversations` для multi-step диалога:

```typescript
// src/conversations/register.ts
import { createConversation } from '@grammyjs/conversations'

export const registerConversation = createConversation(async (conversation, ctx) => {
  await ctx.reply('Введи свой Twitch-ник:')
  const { message } = await conversation.wait()
  const login = message?.text?.trim().toLowerCase()
  
  // Верификация через Twitch API
  const twitchUser = await conversation.external(() => twitchClient.getUser(login))
  if (!twitchUser) {
    await ctx.reply('Канал не найден. Попробуй ещё раз: /register')
    return
  }
  
  // Создать или обновить профиль
  await conversation.external(() => 
    prisma.streamerProfile.upsert({
      where: { login },
      create: { login, displayName: twitchUser.displayName },
      update: { displayName: twitchUser.displayName }
    })
  )
  
  await ctx.reply(
    `✅ Зарегистрирован как ${twitchUser.displayName}!\n\nТеперь можешь заполнить профиль:`,
    { reply_markup: buildProfileKeyboard(login) }
  )
  
  // Далее — обработка inline-кнопок для заполнения полей профиля
})
```

**Зависимость:** установить `@grammyjs/conversations`

### Защита: верификация владения каналом
Минимальная верификация — проверить что стример действительно стримил HotS хотя бы раз:
```typescript
const streams = await twitchClient.getStreamHistory(login, { game_id: HOTS_GAME_ID })
if (streams.length === 0) {
  await ctx.reply('Канал найден, но HotS-стримов не обнаружено. Если ошибка — напиши администратору.')
}
```

---

## ЗАДАЧА 6: Миграция SQLite → PostgreSQL (подготовка к масштабированию)

### Когда делать
После реализации задач 1-5. SQLite начнёт давать проблемы при concurrent writes от системы подписок.

### Изменения минимальны благодаря Prisma

**`prisma/schema.prisma`:**
```prisma
datasource db {
  provider = "postgresql"  // было "sqlite"
  url      = env("DATABASE_URL")
}
```

**`.env`:**
```
DATABASE_URL="postgresql://user:password@localhost:5432/hots_notify"
```

**Типы данных:** Prisma автоматически транслирует типы. Проверить `BigInt` поля — в PostgreSQL это `BIGINT`, совместимо.

**Миграция данных:**
```bash
# Экспорт из SQLite
npx prisma db pull --url="file:./hots-notify.db"  # получить текущую схему
# Импорт в PostgreSQL через pg_dump или скрипт
npx ts-node scripts/migrate-sqlite-to-pg.ts
```

---

## ЗАДАЧА 7: Twitch EventSub для known стримеров (опционально, после задач 1-5)

### Цель
Мгновенные уведомления (< 5 сек) для стримеров с зарегистрированным профилем.

### Архитектура

```
Known стримеры → EventSub webhook → мгновенный анонс + push подписчикам
Unknown стримеры → polling каждые 2 мин → анонс с задержкой до 2 мин
```

### Требования
- Публичный HTTPS endpoint на VPS (nginx + Let's Encrypt уже должны быть)
- При регистрации стримера через `/register` — автоматически подписать на `stream.online`

```typescript
// src/services/eventsub.ts

async function subscribeToStreamOnline(broadcasterId: string): Promise<void> {
  await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: {
      'Client-Id': TWITCH_APP_CLIENT,
      'Authorization': `Bearer ${appToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'stream.online',
      version: '1',
      condition: { broadcaster_user_id: broadcasterId },
      transport: {
        method: 'webhook',
        callback: `${process.env.PUBLIC_URL}/webhook/twitch`,
        secret: process.env.EVENTSUB_SECRET
      }
    })
  })
}
```

```typescript
// src/routes/webhook.ts (Express или встроенный HTTP-сервер)

app.post('/webhook/twitch', express.raw({ type: 'application/json' }), async (req, res) => {
  // 1. Верификация подписи
  const signature = req.headers['twitch-eventsub-message-signature'] as string
  if (!verifyTwitchSignature(req.body, signature, EVENTSUB_SECRET)) {
    return res.status(403).send('Forbidden')
  }
  
  const body = JSON.parse(req.body.toString())
  
  // 2. Подтверждение challenge при создании подписки
  if (body.challenge) {
    return res.status(200).send(body.challenge)
  }
  
  // 3. Обработка события
  if (body.subscription.type === 'stream.online') {
    await handleStreamOnline(body.event.broadcaster_user_login)
  }
  
  res.status(200).send('OK')
})
```

**Добавить в `.env.example`:**
```
PUBLIC_URL=https://yourdomain.com
EVENTSUB_SECRET=random_secret_min_10_chars
```

---

## Порядок реализации

| # | Задача | Сложность | Ценность | Делать когда |
|---|--------|-----------|----------|--------------|
| 1 | Polling 2 мин + RU-фильтр | низкая | высокая | **сейчас** |
| 2 | Схлопнуть "стрим завершён" | низкая | средняя | **сейчас** |
| 3 | Inline-кнопки + фильтр тегов | средняя | высокая | **сейчас** |
| 4 | `/follow` подписки | средняя | высокая | после 1-3 |
| 5 | Self-service `/register` | высокая | средняя | после 4 |
| 6 | SQLite → PostgreSQL | низкая | средняя | после 5 |
| 7 | EventSub | высокая | средняя | последней |

---

## Переменные окружения (обновлённый `.env.example`)

```env
BOT_TOKEN=                    # Telegram bot token
BOT_NAME=                     # Telegram bot username
CHANNEL_ID=                   # Telegram group/channel ID
ADMIN_ID=                     # Telegram user ID администратора

TWITCH_APP_CLIENT=            # Twitch Client ID
TWITCH_APP_SECRET=            # Twitch Client Secret

POLLING_INTERVAL=120          # Интервал опроса в секундах (было 600)
DIGEST_HOUR=21                # Час дайджеста по UTC (= 00:00 МСК при +3)

DATABASE_URL=file:./hots-notify.db   # SQLite (задача 6: сменить на postgres)

# Задача 7 (EventSub):
PUBLIC_URL=                   # Публичный HTTPS URL сервера
EVENTSUB_SECRET=              # Секрет для верификации webhook
```

---

## Заметки по архитектуре

- **Не использовать `any` в TypeScript** — типизировать ответы Twitch API через интерфейсы
- **Логировать ошибки отправки** в Telegram с user_id — помогает отлаживать заблокированных ботом пользователей
- **Rate limiting для уведомлений:** при росте подписчиков использовать очередь (p-queue или bullmq) вместо `Promise.allSettled`
- **Health check endpoint:** добавить `GET /health` возвращающий статус polling и время последнего успешного запроса к Twitch API