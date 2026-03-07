import { describe, it, expect, vi } from 'vitest';
import type { TwitchStream } from '../src/twitch/streams';
import type { StreamerProfile } from '../src/db/profile';

// formatter.ts transitively imports db/profile and db/client (Prisma).
// Mock them to prevent DB initialisation during tests.
vi.mock('../src/db/profile', () => ({}));
vi.mock('../src/db/client', () => ({}));

import {
  formatStreamsEndedMessage,
  formatStreamMessage,
  formatSubscriberNotification,
  getThumbnailUrl,
} from '../src/telegram/formatter';

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_MIN_MS = 60 * 1000;

function makeProfile(overrides: Partial<StreamerProfile> = {}): StreamerProfile {
  return {
    userLogin: 'testuser',
    description: null,
    discord: null,
    telegram: null,
    youtube: null,
    donate: null,
    thumbnailPath: null,
    ...overrides,
  };
}

function makeStream(overrides: Partial<TwitchStream> = {}): TwitchStream {
  return {
    id: '1',
    user_login: 'testuser',
    user_name: 'TestUser',
    game_name: 'Heroes of the Storm',
    title: 'Test stream',
    viewer_count: 100,
    // Default: started 1 hour 5 minutes ago
    started_at: new Date(Date.now() - ONE_HOUR_MS - 5 * ONE_MIN_MS).toISOString(),
    thumbnail_url: 'https://example.com/{width}x{height}.jpg',
    tags: [],
    is_mature: false,
    ...overrides,
  };
}

describe('formatStreamsEndedMessage', () => {
  it('returns empty string for an empty array', () => {
    expect(formatStreamsEndedMessage([])).toBe('');
  });

  it('formats a single ended stream with "Стрим завершён" header', () => {
    const msg = formatStreamsEndedMessage([makeStream({ user_name: 'Streamer1' })]);
    expect(msg).toContain('Стрим завершён');
  });

  it('includes the streamer name for a single ended stream', () => {
    const msg = formatStreamsEndedMessage([makeStream({ user_name: 'Streamer1' })]);
    expect(msg).toContain('Streamer1');
  });

  it('includes duration for a single ended stream', () => {
    const msg = formatStreamsEndedMessage([makeStream()]);
    expect(msg).toContain('Был в эфире');
    // started 1h 5m ago → should mention hours
    expect(msg).toContain('ч');
  });

  it('shows only minutes when stream ran less than one hour', () => {
    const stream = makeStream({
      started_at: new Date(Date.now() - 45 * ONE_MIN_MS).toISOString(),
    });
    const msg = formatStreamsEndedMessage([stream]);
    expect(msg).toContain('45 мин');
    expect(msg).not.toContain('ч');
  });

  it('formats multiple ended streams as a compact list without duration', () => {
    const streams = [
      makeStream({ id: '1', user_name: 'Alpha' }),
      makeStream({ id: '2', user_name: 'Beta' }),
      makeStream({ id: '3', user_name: 'Gamma' }),
    ];
    const msg = formatStreamsEndedMessage(streams);

    expect(msg).toContain('Завершили стрим');
    expect(msg).toContain('Alpha');
    expect(msg).toContain('Beta');
    expect(msg).toContain('Gamma');
    expect(msg).not.toContain('Был в эфире');
  });

  it('does not use the single-stream template for multiple streams', () => {
    const streams = [makeStream({ id: '1' }), makeStream({ id: '2' })];
    const msg = formatStreamsEndedMessage(streams);
    expect(msg).not.toContain('Стрим завершён');
  });

  it('escapes HTML special characters in usernames for single stream', () => {
    const stream = makeStream({ user_name: '<b>Hacker</b>' });
    const msg = formatStreamsEndedMessage([stream]);
    expect(msg).not.toContain('<b>Hacker</b>');
    expect(msg).toContain('&lt;b&gt;Hacker&lt;/b&gt;');
  });

  it('escapes HTML special characters in usernames for multiple streams', () => {
    const streams = [
      makeStream({ id: '1', user_name: '<script>' }),
      makeStream({ id: '2', user_name: 'Normal' }),
    ];
    const msg = formatStreamsEndedMessage(streams);
    expect(msg).not.toContain('<script>');
    expect(msg).toContain('&lt;script&gt;');
  });
});

// ---------------------------------------------------------------------------
// getThumbnailUrl
// ---------------------------------------------------------------------------

describe('getThumbnailUrl', () => {
  it('replaces {width} with 1280', () => {
    const stream = makeStream({ thumbnail_url: 'https://example.com/{width}x{height}.jpg' });
    expect(getThumbnailUrl(stream)).toContain('1280');
    expect(getThumbnailUrl(stream)).not.toContain('{width}');
  });

  it('replaces {height} with 720', () => {
    const stream = makeStream({ thumbnail_url: 'https://example.com/{width}x{height}.jpg' });
    expect(getThumbnailUrl(stream)).toContain('720');
    expect(getThumbnailUrl(stream)).not.toContain('{height}');
  });

  it('produces the expected full URL', () => {
    const stream = makeStream({
      thumbnail_url: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_test-{width}x{height}.jpg',
    });
    expect(getThumbnailUrl(stream)).toBe(
      'https://static-cdn.jtvnw.net/previews-ttv/live_user_test-1280x720.jpg',
    );
  });
});

// ---------------------------------------------------------------------------
// formatStreamMessage
// ---------------------------------------------------------------------------

describe('formatStreamMessage', () => {
  it('includes the stream title', () => {
    const msg = formatStreamMessage(makeStream({ title: 'Epic HotS game' }));
    expect(msg).toContain('Epic HotS game');
  });

  it('includes the streamer name', () => {
    const msg = formatStreamMessage(makeStream({ user_name: 'ZloyEugene' }));
    expect(msg).toContain('ZloyEugene');
  });

  it('includes the Twitch URL', () => {
    const msg = formatStreamMessage(makeStream({ user_login: 'zloyeugene' }));
    expect(msg).toContain('https://twitch.tv/zloyeugene');
  });

  it('includes the viewer count', () => {
    const msg = formatStreamMessage(makeStream({ viewer_count: 1234 }));
    expect(msg).toContain('1');
    expect(msg).toContain('234');
  });

  it('includes #heroesofthestorm hashtag', () => {
    const msg = formatStreamMessage(makeStream());
    expect(msg).toContain('#heroesofthestorm');
  });

  it('escapes HTML in title', () => {
    const msg = formatStreamMessage(makeStream({ title: '<script>alert(1)</script>' }));
    expect(msg).not.toContain('<script>');
    expect(msg).toContain('&lt;script&gt;');
  });

  it('escapes HTML in streamer name', () => {
    const msg = formatStreamMessage(makeStream({ user_name: 'A&B' }));
    expect(msg).toContain('A&amp;B');
  });

  it('adds mature content warning when is_mature is true', () => {
    const msg = formatStreamMessage(makeStream({ is_mature: true }));
    expect(msg).toContain('взрослых');
  });

  it('does not add mature warning when is_mature is false', () => {
    const msg = formatStreamMessage(makeStream({ is_mature: false }));
    expect(msg).not.toContain('взрослых');
  });

  it('includes tags as hashtags', () => {
    const msg = formatStreamMessage(makeStream({ tags: ['HeroesOfTheStorm', 'MOBA'] }));
    expect(msg).toContain('#HeroesOfTheStorm');
    expect(msg).toContain('#MOBA');
  });

  it('strips special characters from tags', () => {
    const msg = formatStreamMessage(makeStream({ tags: ['tag-with-dash'] }));
    expect(msg).not.toContain('-');
  });

  it('limits tags to 5', () => {
    const tags = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
    const msg = formatStreamMessage(makeStream({ tags }));
    expect(msg).toContain('#one');
    expect(msg).not.toContain('#six');
  });

  it('shows no tags line when tags array is empty', () => {
    const msg = formatStreamMessage(makeStream({ tags: [] }));
    expect(msg).not.toContain('🏷');
  });

  it('includes profile description when set', () => {
    const msg = formatStreamMessage(makeStream(), makeProfile({ description: 'Top player since 2015' }));
    expect(msg).toContain('Top player since 2015');
  });

  it('includes discord link when profile has discord', () => {
    const msg = formatStreamMessage(makeStream(), makeProfile({ discord: 'https://discord.gg/abc' }));
    expect(msg).toContain('https://discord.gg/abc');
    expect(msg).toContain('Discord');
  });

  it('shows no profile lines when profile is null', () => {
    const msg = formatStreamMessage(makeStream({ tags: [] }, ), null);
    expect(msg).not.toContain('Discord');
    expect(msg).not.toContain('Telegram');
    expect(msg).not.toContain('YouTube');
  });

  it('shows no profile lines when profile is undefined', () => {
    const msg = formatStreamMessage(makeStream({ tags: [] }));
    expect(msg).not.toContain('Discord');
  });
});

// ---------------------------------------------------------------------------
// formatSubscriberNotification
// ---------------------------------------------------------------------------

describe('formatSubscriberNotification', () => {
  it('includes streamer name in bold', () => {
    const msg = formatSubscriberNotification(makeStream({ user_name: 'ZloyEugene' }));
    expect(msg).toContain('ZloyEugene');
  });

  it('includes the stream title', () => {
    const msg = formatSubscriberNotification(makeStream({ title: 'Ranked grind' }));
    expect(msg).toContain('Ranked grind');
  });

  it('includes the Twitch URL', () => {
    const msg = formatSubscriberNotification(makeStream({ user_login: 'zloyeugene' }));
    expect(msg).toContain('https://twitch.tv/zloyeugene');
  });
});
