import { TwitchStream } from '../twitch/streams';
import { StreamStat } from '../stats';

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
    `📺 <b>${stream.title}</b>`,
    `👤 ${stream.user_name}`,
    ``,
    `⏱ В эфире: ${duration}`,
    `👥 ${viewers} зрителей`,
    `🔗 ${url}`,
  ];

  if (stream.tags.length > 0) {
    lines.push(``, `🏷 ${stream.tags.slice(0, 5).join(' · ')}`);
  }

  if (stream.is_mature) {
    lines.push(`🔞 Трансляция для взрослых`);
  }

  return lines.join('\n');
}

export function formatStreamEndedMessage(stream: TwitchStream): string {
  const url = `https://twitch.tv/${stream.user_login}`;
  return [
    `🔴 <b>Стрим завершён</b>`,
    `👤 ${stream.user_name}`,
    `🔗 ${url}`,
  ].join('\n');
}

export function formatStatsMessage(count: number, top: StreamStat[], activeCount: number): string {
  const lines = [
    `📊 <b>Статистика за сегодня</b>`,
    ``,
    `🎮 Стримеров замечено: ${count}`,
    `📡 Сейчас в эфире: ${activeCount}`,
  ];

  if (top.length > 0) {
    lines.push(``, `🏆 <b>Топ по зрителям:</b>`);
    top.forEach((s, i) => {
      const viewers = s.peakViewers.toLocaleString('ru-RU');
      lines.push(`${i + 1}. ${s.user_name} — ${viewers} зрит.`);
    });
  }

  return lines.join('\n');
}

export function formatDigestMessage(count: number, top: StreamStat[]): string {
  const today = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  });

  const lines = [
    `📊 <b>Дайджест за ${today}</b>`,
    ``,
    `Сегодня в эфире побывали ${count} стримеров`,
  ];

  if (top.length > 0) {
    lines.push(``, `🏆 <b>Топ по пиковым зрителям:</b>`);
    top.forEach((s, i) => {
      const viewers = s.peakViewers.toLocaleString('ru-RU');
      lines.push(`${i + 1}. <a href="https://twitch.tv/${s.user_login}">${s.user_name}</a> — ${viewers} зрит.`);
    });
  }

  lines.push(``, `#HeroesOfTheStorm #HotS`);

  return lines.join('\n');
}
