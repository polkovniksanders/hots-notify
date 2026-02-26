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
  pollingInterval: parseInt(process.env.POLLING_INTERVAL ?? '300', 10) * 1000,
  gameName: process.env.TWITCH_GAME_NAME ?? 'Heroes of the Storm',
};
