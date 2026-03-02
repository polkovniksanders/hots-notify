import { TwitchStream } from '../twitch/streams';
import { TwitchClip } from '../twitch/clips';
import { StreamStat } from '../stats';
import { StreamerProfile } from '../db/profile';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function profileLines(profile: StreamerProfile | null | undefined): string[] {
  if (!profile) return [];

  const lines: string[] = [];

  if (profile.description) {
    lines.push(``, `📝 ${escapeHtml(profile.description)}`);
  }

  const socials: string[] = [];
  if (profile.discord) socials.push(`💬 <a href="${escapeHtml(profile.discord)}">Discord</a>`);
  if (profile.telegram) socials.push(`📱 <a href="${escapeHtml(profile.telegram)}">Telegram</a>`);
  if (profile.youtube) socials.push(`▶️ <a href="${escapeHtml(profile.youtube)}">YouTube</a>`);
  if (profile.donate) socials.push(`💸 <a href="${escapeHtml(profile.donate)}">Донат</a>`);

  if (socials.length > 0) {
    lines.push(``, ...socials);
  }

  return lines;
}

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

export function formatStreamMessage(
  stream: TwitchStream,
  profile?: StreamerProfile | null,
): string {
  const url = `https://twitch.tv/${stream.user_login}`;
  const viewers = stream.viewer_count.toLocaleString('ru-RU');
  const duration = formatDuration(stream.started_at);

  const lines = [
    `📺 <b>${escapeHtml(stream.title)}</b>`,
    `👤 ${escapeHtml(stream.user_name)}`,
    ``,
    `⏱ В эфире: ${duration}`,
    `👥 ${viewers} зрителей`,
    `🔗 ${url}`,
  ];

  if (stream.tags.length > 0) {
    const hashtags = stream.tags
      .slice(0, 5)
      .map((tag) => '#' + tag.replace(/[^\p{L}\p{N}_]/gu, ''))
      .filter((tag) => tag.length > 1)
      .join(' ');
    if (hashtags) lines.push(``, `🏷 ${hashtags}`);
  }

  if (stream.is_mature) {
    lines.push(`🔞 Трансляция для взрослых`);
  }

  lines.push(...profileLines(profile));

  lines.push(``, `#heroesofthestorm`);

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

export function formatDigestMessage(
  count: number,
  top: StreamStat[],
  date: string,
  avgPeakViewers: number,
  clips: TwitchClip[] = [],
): string {
  const lines = [
    `📊 <b>Дайджест за ${date}</b>`,
    ``,
    `🎮 Стримеров за день: ${count}`,
    `👥 Средний пик зрителей: ${avgPeakViewers.toLocaleString('ru-RU')}`,
  ];

  if (top.length > 0) {
    lines.push(``, `🏆 <b>Топ стримеров по зрителям:</b>`);
    top.forEach((s, i) => {
      const viewers = s.peakViewers.toLocaleString('ru-RU');
      lines.push(`${i + 1}. <a href="https://twitch.tv/${s.user_login}">${s.user_name}</a> — ${viewers} зрит.`);
    });
  }

  if (clips.length > 0) {
    lines.push(``, `🎬 <b>Топ клипов дня:</b>`);
    clips.forEach((c, i) => {
      const views = c.view_count.toLocaleString('ru-RU');
      lines.push(`${i + 1}. <a href="${c.url}">${escapeHtml(c.title)}</a> — ${escapeHtml(c.broadcaster_name)}, ${views} просм.`);
    });
  }

  lines.push(``, `<i>Зрители — пик за день по данным Twitch API</i>`);
  lines.push(``, `#HeroesOfTheStorm`);

  return lines.join('\n');
}
