import { Bot, InlineKeyboard } from 'grammy';
import { config } from '../config';
import { TwitchStream } from '../twitch/streams';
import { getThumbnailUrl, formatStatsMessage } from './formatter';
import { getDailyStats } from '../stats';

export const bot = new Bot(config.botToken);

// Команда /stats — отвечает в любом чате где есть бот
bot.command('stats', async (ctx) => {
  // Получаем количество активных стримов через трекер — передаём снаружи
  const { count, top } = getDailyStats();
  const message = formatStatsMessage(count, top, getActiveCount());
  await ctx.reply(message, { parse_mode: 'HTML' });
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
