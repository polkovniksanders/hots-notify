import { Bot } from 'grammy';
import { config } from '../config';
import { TwitchStream } from '../twitch/streams';
import { getThumbnailUrl } from './formatter';

export const bot = new Bot(config.botToken);

export async function sendStreamNotification(stream: TwitchStream, caption: string): Promise<void> {
  const thumbnailUrl = getThumbnailUrl(stream);

  try {
    await bot.api.sendPhoto(config.channelId, thumbnailUrl, {
      caption,
      parse_mode: 'HTML',
    });
  } catch {
    // Fallback: отправить текстом если фото недоступно
    await bot.api.sendMessage(config.channelId, caption, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  }
}
