import { TwitchStream } from './twitch/streams';

export interface StreamStat {
  user_login: string;
  user_name: string;
  peakViewers: number;
}

const records = new Map<string, StreamStat>();
let lastDigestDate = '';
let statsForDate = '';

export function recordStream(stream: TwitchStream): void {
  if (!statsForDate) {
    statsForDate = new Date().toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Moscow',
    });
  }
  const existing = records.get(stream.user_login);
  if (!existing || stream.viewer_count > existing.peakViewers) {
    records.set(stream.user_login, {
      user_login: stream.user_login,
      user_name: stream.user_name,
      peakViewers: stream.viewer_count,
    });
  }
}

export function getDailyStats(): { count: number; top: StreamStat[]; date: string; avgPeakViewers: number } {
  const all = [...records.values()].sort((a, b) => b.peakViewers - a.peakViewers);
  const avgPeakViewers =
    all.length > 0 ? Math.round(all.reduce((sum, s) => sum + s.peakViewers, 0) / all.length) : 0;
  return { count: all.length, top: all.slice(0, 10), date: statsForDate, avgPeakViewers };
}

export function shouldSendDigest(digestHour: number): boolean {
  const now = new Date();
  const today = now.toDateString();
  if (now.getUTCHours() === digestHour && lastDigestDate !== today) {
    lastDigestDate = today;
    return true;
  }
  return false;
}

export function resetDailyStats(): void {
  records.clear();
  statsForDate = '';
}
