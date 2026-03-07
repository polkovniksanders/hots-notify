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

### Кастомные превью стримеров
`/setthumbnail <login>` (фото в подписи к сообщению) — сохраняет JPG на сервере в `data/thumbnails/`. `/clearthumbnail <login>` — удаляет. Поддерживаются как сжатые фото, так и файлы (документы). Кастомное превью имеет приоритет над Twitch-скриншотом.

### Качество кода и деплой
- Тесты: 111 тестов (vitest), 7 файлов — tracker, formatter, streams, profile, subscription, users, follow
- `npm test` в `deploy.sh` перед build: падение тестов останавливает деплой
- Prisma миграции применяются автоматически при деплое
- `*.db` в `.gitignore` — БД не попадает в репозиторий

---

## ЗАДАЧА 6: Уменьшить polling interval + оптимизировать

### Цель
Сократить задержку уведомления с 10 минут до 2 минут.

### Изменения
- Изменить `POLLING_INTERVAL` по умолчанию с 600 до 120 секунд
- Проверить что rate limit Twitch выдерживается (800 req/min; при 2 мин интервале ~720 req/день — ок)

---

## ЗАДАЧА 7: Self-service регистрация стримеров `/register`

### Цель
Убрать зависимость от ручного `/set` через ADMIN. Стример сам заполняет профиль.

### Flow
```
/register → бот просит Twitch-ник → верификация через Twitch API →
inline-кнопки для заполнения полей профиля (description, discord, telegram, youtube, donate)
```

### Техническое
- `@grammyjs/conversations` для multi-step диалога
- Минимальная верификация: стример стримил HotS хотя бы раз (`GET /helix/videos?game_id=138585`)
- FSM с состояниями через grammY sessions или conversations

---

## ЗАДАЧА 8: Миграция SQLite → PostgreSQL

### Когда делать
После реализации задачи 7. SQLite начнёт давать проблемы при concurrent writes.

### Изменения
- `provider = "postgresql"` в `prisma/schema.prisma`
- `DATABASE_URL` в `.env` → строка подключения PostgreSQL
- Скрипт миграции данных из SQLite

---

## ЗАДАЧА 9: Twitch EventSub для known стримеров

### Цель
Мгновенные уведомления (< 5 сек) для стримеров с профилем вместо ожидания polling.

### Архитектура
```
Стримеры с профилем → EventSub webhook → мгновенный анонс
Остальные → polling каждые N минут
```

### Требования
- Публичный HTTPS endpoint (nginx + Let's Encrypt)
- При регистрации стримера — автоматическая подписка на `stream.online`
- Верификация подписи Twitch в webhook-обработчике

---

## Порядок реализации

| # | Задача | Сложность | Ценность | Статус |
|---|--------|-----------|----------|--------|
| 1 | Polling + RU-фильтр | низкая | высокая | ✅ Готово |
| 2 | Схлопнуть "завершён" | низкая | средняя | ✅ Готово |
| 3 | Inline-кнопки + превью | средняя | высокая | ✅ Готово |
| 4 | `/follow` подписки | средняя | высокая | ✅ Готово |
| 5 | Профили стримеров | средняя | высокая | ✅ Частично (admin-only) |
| 6 | Polling interval 2 мин | низкая | высокая | **следующая** |
| 7 | Self-service `/register` | высокая | средняя | запланировано |
| 8 | SQLite → PostgreSQL | низкая | средняя | после 7 |
| 9 | EventSub | высокая | средняя | последней |

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
