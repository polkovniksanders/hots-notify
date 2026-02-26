import { TwitchStream } from '../twitch/streams';

function formatDuration(startedAt: string): string {
  const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

export function getThumbnailUrl(stream: TwitchStream): string {
  return stream.thumbnail_url
    .replace('{width}', '1280')
    .replace('{height}', '720');
}

export function formatStreamMessage(stream: TwitchStream): string {
  const url = `https://twitch.tv/${stream.user_login}`;
  const viewers = stream.viewer_count.toLocaleString('ru-RU');
  const duration = formatDuration(stream.started_at);

  const lines = [
    `🎮 <b>${stream.game_name}</b>`,
    ``,
    `👤 <b>${stream.user_name}</b>`,
    `📺 ${stream.title}`,
    `⏱ В эфире: ${duration}`,
    `👥 ${viewers} зрителей`,
    `🔗 ${url}`,
  ];

  if (stream.tags.length > 0) {
    lines.push(``, `🏷 ${stream.tags.slice(0, 5).join(' · ')}`);
  }

  return lines.join('\n');
}
