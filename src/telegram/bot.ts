import fs from 'fs';
import path from 'path';
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { config } from '../config';
import { TwitchStream } from '../twitch/streams';
import { getThumbnailUrl, formatStatsMessage } from './formatter';
import { getDailyStats } from '../stats';
import { generateWelcome } from '../ai/greeter';
import {
  getProfile,
  setProfileField,
  clearProfileField,
  deleteProfile,
  isProfileField,
  isUrlField,
  isValidHttpUrl,
  PROFILE_FIELDS,
  setThumbnailPath,
  clearThumbnailPath,
} from '../db/profile';
import { registerFollowCommands } from './commands/follow';
import {
  addChannelSubscription,
  removeChannelSubscription,
  getChannelSubscription,
  getAllChannelSubscriptions,
} from '../db/channel';

const THUMBNAILS_DIR = path.join(process.cwd(), 'data', 'thumbnails');

export const bot = new Bot(config.botToken);

// Проверка: личное сообщение от администратора
function isAdmin(ctx: { chat?: { type: string }; from?: { id: number } }): boolean {
  return (
    ctx.chat?.type === 'private' &&
    config.adminId !== '' &&
    String(ctx.from?.id) === config.adminId
  );
}

// Защита от спама: в ЛС разрешаем только команды (начинаются с '/').
// Администратор проходит без ограничений.
bot.on('message', async (ctx, next) => {
  if (ctx.chat?.type === 'private' && !isAdmin(ctx) && !ctx.message.text?.startsWith('/')) return;
  return next();
});

// Кулдаун /stats: не чаще одного раза в 30 секунд на чат
const statsCooldowns = new Map<number, number>();
const STATS_COOLDOWN_MS = 30_000;

// Команда /stats — отвечает в любом чате где есть бот
bot.command('stats', async (ctx) => {
  const chatId = ctx.chat.id;
  const now = Date.now();
  if (now - (statsCooldowns.get(chatId) ?? 0) < STATS_COOLDOWN_MS) return;
  statsCooldowns.set(chatId, now);

  const { count, top } = getDailyStats();
  const message = formatStatsMessage(count, top, getActiveCount());
  await ctx.reply(message, { parse_mode: 'HTML' });
});

// Приветствие новых участников через AI
// Пропускаем: ботов, массовые вступления (> 3 за раз — вероятный спам)
bot.on('message:new_chat_members', async (ctx) => {
  const newMembers = ctx.message.new_chat_members.filter((m) => !m.is_bot);
  if (newMembers.length === 0 || newMembers.length > 3) return;

  for (const member of newMembers) {
    const welcome = await generateWelcome(member.first_name);
    if (welcome) {
      await ctx.reply(welcome);
    }
  }
});

// /set <username> <field> <value>
// Устанавливает поле профиля стримера. Только для администратора в личке.
bot.command('set', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const args = (ctx.match ?? '').trim().split(/\s+/);
  if (args.length < 3 || args[0] === '') {
    await ctx.reply(
      `Использование: /set &lt;username&gt; &lt;поле&gt; &lt;значение&gt;\nПоля: ${PROFILE_FIELDS.join(', ')}`,
      { parse_mode: 'HTML' },
    );
    return;
  }

  const [userLogin, field, ...valueParts] = args;
  const value = valueParts.join(' ').trim();

  if (!isProfileField(field)) {
    await ctx.reply(`Неизвестное поле: <b>${field}</b>\nДоступные поля: ${PROFILE_FIELDS.join(', ')}`, {
      parse_mode: 'HTML',
    });
    return;
  }

  if (isUrlField(field) && !isValidHttpUrl(value)) {
    await ctx.reply(`Поле <b>${field}</b> должно содержать корректный URL (http/https).`, {
      parse_mode: 'HTML',
    });
    return;
  }

  await setProfileField(userLogin, field, value);
  await ctx.reply(`✅ Профиль <b>${userLogin}</b>\nПоле <b>${field}</b> обновлено.`, {
    parse_mode: 'HTML',
  });
});

// /clear <username> <field>
// Сбрасывает поле профиля в null. Только для администратора в личке.
bot.command('clear', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const args = (ctx.match ?? '').trim().split(/\s+/);
  if (args.length < 2 || args[0] === '') {
    await ctx.reply(
      `Использование: /clear &lt;username&gt; &lt;поле&gt;\nПоля: ${PROFILE_FIELDS.join(', ')}`,
      { parse_mode: 'HTML' },
    );
    return;
  }

  const [userLogin, field] = args;

  if (!isProfileField(field)) {
    await ctx.reply(`Неизвестное поле: <b>${field}</b>\nДоступные поля: ${PROFILE_FIELDS.join(', ')}`, {
      parse_mode: 'HTML',
    });
    return;
  }

  await clearProfileField(userLogin, field);
  await ctx.reply(`🗑 Профиль <b>${userLogin}</b>\nПоле <b>${field}</b> очищено.`, {
    parse_mode: 'HTML',
  });
});

// /profile <username>
// Показывает текущий профиль стримера. Только для администратора в личке.
bot.command('profile', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const userLogin = (ctx.match ?? '').trim().split(/\s+/)[0];
  if (!userLogin) {
    await ctx.reply('Использование: /profile &lt;username&gt;', { parse_mode: 'HTML' });
    return;
  }

  const profile = await getProfile(userLogin);
  if (!profile) {
    await ctx.reply(`Профиль <b>${userLogin}</b> не найден.`, { parse_mode: 'HTML' });
    return;
  }

  const lines = [`👤 Профиль <b>${profile.userLogin}</b>`, ``];
  for (const field of PROFILE_FIELDS) {
    const value = profile[field];
    lines.push(`${field}: ${value ?? '—'}`);
  }

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
});

// /delprofile <username>
// Удаляет профиль стримера полностью. Только для администратора в личке.
bot.command('delprofile', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const userLogin = (ctx.match ?? '').trim().split(/\s+/)[0];
  if (!userLogin) {
    await ctx.reply('Использование: /delprofile &lt;username&gt;', { parse_mode: 'HTML' });
    return;
  }

  const deleted = await deleteProfile(userLogin);
  if (deleted) {
    await ctx.reply(`🗑 Профиль <b>${userLogin}</b> удалён.`, { parse_mode: 'HTML' });
  } else {
    await ctx.reply(`Профиль <b>${userLogin}</b> не найден.`, { parse_mode: 'HTML' });
  }
});

// Сохраняет превью стримера по fileId из Telegram
async function saveThumbnail(
  ctx: { api: typeof bot.api; reply: (text: string, opts?: object) => Promise<unknown> },
  login: string,
  fileId: string,
): Promise<void> {
  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) {
    await ctx.reply('❌ Не удалось получить файл от Telegram.');
    return;
  }

  const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
  const response = await fetch(fileUrl);
  if (!response.ok) {
    await ctx.reply(`❌ Ошибка загрузки файла от Telegram: HTTP ${response.status}`);
    return;
  }

  await fs.promises.mkdir(THUMBNAILS_DIR, { recursive: true });
  const filePath = path.join(THUMBNAILS_DIR, `${login}.jpg`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.promises.writeFile(filePath, buffer);

  await setThumbnailPath(login, filePath);
  await ctx.reply(
    `✅ Превью для <b>${login}</b> сохранено.\n📐 Размер файла: ${(buffer.length / 1024).toFixed(1)} КБ`,
    { parse_mode: 'HTML' },
  );
}

// /setthumbnail <username> — текстовая команда (без фото): показывает инструкцию
// Только для администратора в личке.
bot.command('setthumbnail', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.reply(
    'Использование: отправьте фото (или файл) с подписью <code>/setthumbnail &lt;login&gt;</code>',
    { parse_mode: 'HTML' },
  );
});

// Обработка фото и документов с подписью /setthumbnail <login>
// bot.command() не матчит команды в caption — нужен отдельный обработчик.
bot.on(['message:photo', 'message:document'], async (ctx) => {
  if (!isAdmin(ctx)) return;

  const caption = ctx.message.caption ?? '';
  const match = caption.match(/^\/setthumbnail\s+(\S+)/i);
  if (!match) return;

  const login = match[1].toLowerCase();
  const photo = ctx.message.photo;
  const document = ctx.message.document;
  const fileId = photo ? photo[photo.length - 1].file_id : document?.file_id;
  if (!fileId) return;

  try {
    await saveThumbnail(ctx, login, fileId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ Ошибка при сохранении превью: <code>${message}</code>`, {
      parse_mode: 'HTML',
    });
  }
});

// /clearthumbnail <username>
// Удаляет кастомное превью стримера. Только для администратора в личке.
bot.command('clearthumbnail', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const login = (ctx.match ?? '').trim().split(/\s+/)[0].toLowerCase();
  if (!login) {
    await ctx.reply('Использование: /clearthumbnail &lt;login&gt;', { parse_mode: 'HTML' });
    return;
  }

  try {
    const filePath = path.join(THUMBNAILS_DIR, `${login}.jpg`);
    await fs.promises.rm(filePath, { force: true });
    await clearThumbnailPath(login);
    await ctx.reply(`🗑 Превью для <b>${login}</b> удалено.`, { parse_mode: 'HTML' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ Ошибка при удалении превью: <code>${message}</code>`, {
      parse_mode: 'HTML',
    });
  }
});

// /addchannel <chat_id> <twitch_login>
// Привязывает Telegram-канал к стримеру — бот будет слать туда уведомления.
// Только для администратора в личке.
bot.command('addchannel', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const args = (ctx.match ?? '').trim().split(/\s+/);
  if (args.length < 2 || args[0] === '') {
    await ctx.reply(
      'Использование: /addchannel &lt;chat_id&gt; &lt;twitch_login&gt;\n\n' +
        'Пример: <code>/addchannel -1001234567890 zloyeugene</code>\n\n' +
        'chat_id канала можно узнать, переслав любое сообщение из канала сюда.',
      { parse_mode: 'HTML' },
    );
    return;
  }

  const [chatIdStr, streamerLogin] = args;
  let chatId: bigint;
  try {
    chatId = BigInt(chatIdStr);
  } catch {
    await ctx.reply('❌ Некорректный chat_id. Должно быть число (например: <code>-1001234567890</code>).', {
      parse_mode: 'HTML',
    });
    return;
  }

  await addChannelSubscription(chatId, streamerLogin);
  await ctx.reply(
    `✅ Канал <code>${chatId}</code> привязан к стримеру <b>${streamerLogin.toLowerCase()}</b>.\n` +
      `Бот будет слать уведомления о его стримах в этот чат.`,
    { parse_mode: 'HTML' },
  );
});

// /removechannel <chat_id>
// Отвязывает Telegram-канал от стримера. Только для администратора в личке.
bot.command('removechannel', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const chatIdStr = (ctx.match ?? '').trim().split(/\s+/)[0];
  if (!chatIdStr) {
    await ctx.reply('Использование: /removechannel &lt;chat_id&gt;', { parse_mode: 'HTML' });
    return;
  }

  let chatId: bigint;
  try {
    chatId = BigInt(chatIdStr);
  } catch {
    await ctx.reply('❌ Некорректный chat_id.', { parse_mode: 'HTML' });
    return;
  }

  const removed = await removeChannelSubscription(chatId);
  if (removed) {
    await ctx.reply(`🗑 Канал <code>${chatId}</code> отвязан.`, { parse_mode: 'HTML' });
  } else {
    await ctx.reply(`Канал <code>${chatId}</code> не найден в базе.`, { parse_mode: 'HTML' });
  }
});

// /listchannels
// Показывает все зарегистрированные каналы. Только для администратора в личке.
bot.command('listchannels', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const subs = await getAllChannelSubscriptions();
  if (subs.length === 0) {
    await ctx.reply('Зарегистрированных каналов нет.', { parse_mode: 'HTML' });
    return;
  }

  const lines = [`📋 <b>Зарегистрированные каналы (${subs.length}):</b>`, ``];
  for (const s of subs) {
    lines.push(`<code>${s.chatId}</code> → <b>${s.streamerLogin}</b>`);
  }
  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
});

// Помощь при пересылке сообщения из канала: отвечает chat_id источника.
// Упрощает получение chat_id канала для /addchannel.
bot.on('message:forward_origin', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const origin = ctx.message.forward_origin;
  if (origin.type === 'channel') {
    const chatId = origin.chat.id;
    const sub = await getChannelSubscription(BigInt(chatId));
    const status = sub
      ? `✅ Уже привязан к <b>${sub.streamerLogin}</b>`
      : `➕ Не привязан. Команда: <code>/addchannel ${chatId} &lt;twitch_login&gt;</code>`;
    await ctx.reply(
      `📋 chat_id этого канала: <code>${chatId}</code>\n${status}`,
      { parse_mode: 'HTML' },
    );
  }
});

// Регистрируем команды подписки (/follow, /unfollow, /follows)
registerFollowCommands(bot);

// Callback для получения актуального числа активных стримов
let getActiveCount: () => number = () => 0;
export function setActiveCountGetter(fn: () => number): void {
  getActiveCount = fn;
}

/** Builds an InputFile for the stream thumbnail. Custom file takes priority over Twitch URL. */
async function buildThumbnail(
  stream: TwitchStream,
  thumbnailPath?: string | null,
): Promise<InputFile | null> {
  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    return new InputFile(fs.createReadStream(thumbnailPath));
  }
  try {
    const response = await fetch(getThumbnailUrl(stream));
    if (response.ok) {
      // Send bytes to bypass Telegram's URL-based cache
      const buffer = Buffer.from(await response.arrayBuffer());
      return new InputFile(buffer, 'thumbnail.jpg');
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Sends a stream notification to any Telegram chat.
 * Used both for the main channel and for individual streamer channels.
 */
export async function sendStreamToChat(
  chatId: number | string | bigint,
  stream: TwitchStream,
  caption: string,
  thumbnailPath?: string | null,
): Promise<void> {
  const url = `https://twitch.tv/${stream.user_login}`;
  const keyboard = new InlineKeyboard()
    .url('▶️ Смотреть', url)
    .text('🔔 Подписаться', `subscribe:${stream.user_login}`);

  const photo = await buildThumbnail(stream, thumbnailPath);

  if (photo) {
    try {
      await bot.api.sendPhoto(String(chatId), photo, {
        caption,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
      return;
    } catch {
      // fall through to text message
    }
  }

  await bot.api.sendMessage(String(chatId), caption, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: keyboard,
  });
}

export async function sendStreamNotification(
  stream: TwitchStream,
  caption: string,
  thumbnailPath?: string | null,
): Promise<void> {
  await sendStreamToChat(config.channelId, stream, caption, thumbnailPath);
}

export async function sendTextMessage(message: string): Promise<void> {
  await bot.api.sendMessage(config.channelId, message, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
}
