import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TwitchStream } from '../src/twitch/streams';

// Mocks must be declared before importing the module under test.
// vitest hoists vi.mock calls automatically.
vi.mock('axios');
vi.mock('../src/twitch/auth', () => ({
  getAccessToken: vi.fn().mockResolvedValue('test-token'),
}));
vi.mock('../src/config', () => ({
  config: { twitchClientId: 'test-client-id' },
}));

import axios from 'axios';
import { fetchRussianStreams, fetchStreamsByLogins, isRussianByContent } from '../src/twitch/streams';

function makeStream(overrides: Partial<TwitchStream> = {}): TwitchStream {
  return {
    id: '1',
    user_login: 'testuser',
    user_name: 'TestUser',
    game_name: 'Heroes of the Storm',
    title: 'Test stream',
    viewer_count: 100,
    started_at: new Date().toISOString(),
    thumbnail_url: 'https://example.com/{width}x{height}.jpg',
    tags: [],
    is_mature: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isRussianByContent — pure function, no mocks needed
// ---------------------------------------------------------------------------
describe('isRussianByContent', () => {
  it('returns true when title contains Cyrillic characters', () => {
    expect(isRussianByContent(makeStream({ title: 'Играем HotS' }))).toBe(true);
  });

  it('returns false for Latin-only title with no ru tags', () => {
    expect(isRussianByContent(makeStream({ title: 'Playing HotS', tags: [] }))).toBe(false);
  });

  it('returns true for tag "ru"', () => {
    expect(isRussianByContent(makeStream({ title: 'HotS grind', tags: ['ru'] }))).toBe(true);
  });

  it('returns true for tag "Russian" (case-insensitive)', () => {
    expect(isRussianByContent(makeStream({ title: 'HotS', tags: ['Russian'] }))).toBe(true);
  });

  it('returns true for tag "Русский"', () => {
    expect(isRussianByContent(makeStream({ title: 'HotS', tags: ['Русский'] }))).toBe(true);
  });

  it('returns true for tag "рус"', () => {
    expect(isRussianByContent(makeStream({ title: 'HotS', tags: ['рус'] }))).toBe(true);
  });

  it('returns false for irrelevant English tags', () => {
    expect(isRussianByContent(makeStream({ title: 'HotS', tags: ['english', 'casual'] }))).toBe(false);
  });

  it('returns true when Cyrillic is present in title even with no tags', () => {
    expect(isRussianByContent(makeStream({ title: 'ЗА ПОБЕДУ', tags: [] }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fetchRussianStreams — requires mocked axios
// ---------------------------------------------------------------------------
describe('fetchRussianStreams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('combines language=ru streams with content-filtered streams, no duplicates', async () => {
    const ruStream = makeStream({ id: '1', user_name: 'RuUser', title: 'test' });
    const cyrillicStream = makeStream({ id: '2', user_name: 'CyrUser', title: 'Играем' });
    const englishStream = makeStream({ id: '3', user_name: 'EnUser', title: 'English only' });

    vi.mocked(axios.get)
      // First call: language=ru
      .mockResolvedValueOnce({ data: { data: [ruStream] } })
      // Second call: all streams
      .mockResolvedValueOnce({ data: { data: [ruStream, cyrillicStream, englishStream] } });

    const result = await fetchRussianStreams('138585');

    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(['1', '2']);
  });

  it('does not duplicate a stream that appears in both result sets', async () => {
    const stream = makeStream({ id: '1', title: 'Играем', tags: ['ru'] });

    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: { data: [stream] } })
      .mockResolvedValueOnce({ data: { data: [stream] } });

    const result = await fetchRussianStreams('138585');

    expect(result).toHaveLength(1);
  });

  it('returns only language=ru streams when all-streams response has no Russian content', async () => {
    const ruStream = makeStream({ id: '1', title: 'test' });
    const enStream = makeStream({ id: '2', title: 'English', tags: [] });

    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: { data: [ruStream] } })
      .mockResolvedValueOnce({ data: { data: [ruStream, enStream] } });

    const result = await fetchRussianStreams('138585');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('makes exactly two API requests', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { data: [] } });

    await fetchRussianStreams('138585');

    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it('sends language=ru on one request and no language on the other', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { data: [] } });

    await fetchRussianStreams('138585');

    const paramsList = vi.mocked(axios.get).mock.calls.map((c) => c[1]?.params);
    expect(paramsList.some((p) => p?.language === 'ru')).toBe(true);
    expect(paramsList.some((p) => !p?.language)).toBe(true);
  });

  it('returns empty array when both requests return no streams', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { data: [] } });

    const result = await fetchRussianStreams('138585');

    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// fetchStreamsByLogins — fast poll for specific streamers
// ---------------------------------------------------------------------------

describe('fetchStreamsByLogins', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array and makes no API call for empty input', async () => {
    const result = await fetchStreamsByLogins([]);

    expect(result).toHaveLength(0);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('returns streams for the given logins', async () => {
    const stream = makeStream({ user_login: 'zloyeugene', user_name: 'ZloyEugene' });
    vi.mocked(axios.get).mockResolvedValue({ data: { data: [stream] } });

    const result = await fetchStreamsByLogins(['zloyeugene']);

    expect(result).toHaveLength(1);
    expect(result[0].user_login).toBe('zloyeugene');
  });

  it('returns empty array when none of the streamers are live', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { data: [] } });

    const result = await fetchStreamsByLogins(['offline_streamer']);

    expect(result).toHaveLength(0);
  });

  it('makes exactly one API call', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { data: [] } });

    await fetchStreamsByLogins(['streamer1', 'streamer2']);

    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('includes all logins in the request URL', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { data: [] } });

    await fetchStreamsByLogins(['streamer1', 'streamer2']);

    const url = vi.mocked(axios.get).mock.calls[0][0] as string;
    expect(url).toContain('user_login=streamer1');
    expect(url).toContain('user_login=streamer2');
  });

  it('calls the /helix/streams endpoint', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { data: [] } });

    await fetchStreamsByLogins(['streamer1']);

    const url = vi.mocked(axios.get).mock.calls[0][0] as string;
    expect(url).toContain('api.twitch.tv/helix/streams');
  });

  it('passes the access token in the Authorization header', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { data: [] } });

    await fetchStreamsByLogins(['streamer1']);

    const options = vi.mocked(axios.get).mock.calls[0][1];
    expect(options?.headers?.['Authorization']).toBe('Bearer test-token');
  });

  it('returns multiple live streams', async () => {
    const streams = [
      makeStream({ id: '1', user_login: 'streamer1' }),
      makeStream({ id: '2', user_login: 'streamer2' }),
    ];
    vi.mocked(axios.get).mockResolvedValue({ data: { data: streams } });

    const result = await fetchStreamsByLogins(['streamer1', 'streamer2']);

    expect(result).toHaveLength(2);
  });
});
