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

// /setthumbnail <username>
// Устанавливает кастомное превью для стримера. Отправьте фото с этой подписью.
// Только для администратора в личке.
bot.command('setthumbnail', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const login = (ctx.match ?? '').trim().split(/\s+/)[0].toLowerCase();
  if (!login) {
    await ctx.reply(
      'Использование: отправьте фото с подписью <code>/setthumbnail &lt;login&gt;</code>',
      { parse_mode: 'HTML' },
    );
    return;
  }

  const photo = ctx.message?.photo;
  if (!photo || photo.length === 0) {
    await ctx.reply(
      '📎 Прикрепите фото к сообщению с командой <code>/setthumbnail &lt;login&gt;</code>',
      { parse_mode: 'HTML' },
    );
    return;
  }

  try {
    const fileId = photo[photo.length - 1].file_id;
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

// Регистрируем команды подписки (/follow, /unfollow, /follows)
registerFollowCommands(bot);

// Callback для получения актуального числа активных стримов
let getActiveCount: () => number = () => 0;
export function setActiveCountGetter(fn: () => number): void {
  getActiveCount = fn;
}

export async function sendStreamNotification(
  stream: TwitchStream,
  caption: string,
  thumbnailPath?: string | null,
): Promise<void> {
  const url = `https://twitch.tv/${stream.user_login}`;

  const keyboard = new InlineKeyboard()
    .url('▶️ Смотреть', url)
    .text('🔔 Подписаться', `subscribe:${stream.user_login}`);

  // Resolve photo source: custom local file → download from Twitch → fallback to text
  let photo: InputFile | null = null;

  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    photo = new InputFile(fs.createReadStream(thumbnailPath));
  } else {
    try {
      const thumbnailUrl = getThumbnailUrl(stream);
      const response = await fetch(thumbnailUrl);
      if (response.ok) {
        // Send as bytes to bypass Telegram's URL-based thumbnail cache
        const buffer = Buffer.from(await response.arrayBuffer());
        photo = new InputFile(buffer, 'thumbnail.jpg');
      }
    } catch {
      // fall through to text message
    }
  }

  if (photo) {
    try {
      await bot.api.sendPhoto(config.channelId, photo, {
        caption,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
      return;
    } catch {
      // fall through to text message
    }
  }

  await bot.api.sendMessage(config.channelId, caption, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: keyboard,
  });
}

export async function sendTextMessage(message: string): Promise<void> {
  await bot.api.sendMessage(config.channelId, message, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
}
