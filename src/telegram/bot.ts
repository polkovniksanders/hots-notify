import { Bot, InlineKeyboard } from 'grammy';
import { config } from '../config';
import { TwitchStream } from '../twitch/streams';
import { getThumbnailUrl, formatStatsMessage } from './formatter';
import { getDailyStats } from '../stats';
import {
  getProfile,
  setProfileField,
  clearProfileField,
  deleteProfile,
  isProfileField,
  isUrlField,
  isValidHttpUrl,
  PROFILE_FIELDS,
} from '../db/profile';

export const bot = new Bot(config.botToken);

// Проверка: личное сообщение от администратора
function isAdmin(ctx: { chat?: { type: string }; from?: { id: number } }): boolean {
  return (
    ctx.chat?.type === 'private' &&
    config.adminId !== '' &&
    String(ctx.from?.id) === config.adminId
  );
}

// Команда /stats — отвечает в любом чате где есть бот
bot.command('stats', async (ctx) => {
  // Получаем количество активных стримов через трекер — передаём снаружи
  const { count, top } = getDailyStats();
  const message = formatStatsMessage(count, top, getActiveCount());
  await ctx.reply(message, { parse_mode: 'HTML' });
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

// Callback для получения актуального числа активных стримов
let getActiveCount: () => number = () => 0;
export function setActiveCountGetter(fn: () => number): void {
  getActiveCount = fn;
}

export async function sendStreamNotification(stream: TwitchStream, caption: string): Promise<void> {
  const thumbnailUrl = getThumbnailUrl(stream);
  const url = `https://twitch.tv/${stream.user_login}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`Смотрю стрим по Heroes of the Storm: ${stream.title}`)}`;

  const keyboard = new InlineKeyboard()
    .url('▶️ Смотреть', url)
    .url('📢 Поделиться', shareUrl);

  try {
    await bot.api.sendPhoto(config.channelId, thumbnailUrl, {
      caption,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch {
    await bot.api.sendMessage(config.channelId, caption, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard,
    });
  }
}

export async function sendTextMessage(message: string): Promise<void> {
  await bot.api.sendMessage(config.channelId, message, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
}
