import 'dotenv/config';

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env variable: ${key}`);
  return value;
}

export const config = {
  botToken: required('BOT_TOKEN'),
  channelId: required('CHANNEL_ID'),
  twitchClientId: required('TWITCH_APP_CLIENT'),
  twitchClientSecret: required('TWITCH_APP_SECRET'),
  pollingInterval: parseInt(process.env.POLLING_INTERVAL ?? '600', 10) * 1000,
  gameName: process.env.TWITCH_GAME_NAME ?? 'Heroes of the Storm',
  // Час отправки дайджеста по UTC (21 UTC = 00:00 MSK)
  digestHour: parseInt(process.env.DIGEST_HOUR ?? '21', 10),
  // Telegram user ID администратора (строка, чтобы точно совпадало с ctx.from.id)
  adminId: process.env.ADMIN_ID ?? '',
};
