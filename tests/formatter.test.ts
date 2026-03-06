import { describe, it, expect, vi } from 'vitest';
import type { TwitchStream } from '../src/twitch/streams';

// formatter.ts transitively imports db/profile and db/client (Prisma).
// Mock them to prevent DB initialisation during tests.
vi.mock('../src/db/profile', () => ({}));
vi.mock('../src/db/client', () => ({}));

import { formatStreamsEndedMessage } from '../src/telegram/formatter';

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_MIN_MS = 60 * 1000;

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
