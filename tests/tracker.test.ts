import { describe, it, expect, beforeEach } from 'vitest';
import type { TwitchStream } from '../src/twitch/streams';
import { initTracker, getNewStreams, removeEndedStreams, getActiveCount } from '../src/tracker';

function makeStream(overrides: Partial<TwitchStream> = {}): TwitchStream {
  return {
    id: 'stream-id-1',
    user_login: 'testuser',
    user_name: 'TestUser',
    game_name: 'Heroes of the Storm',
    title: 'Test stream',
    viewer_count: 100,
    started_at: '2026-03-07T10:00:00Z',
    thumbnail_url: 'https://example.com/{width}x{height}.jpg',
    tags: [],
    is_mature: false,
    ...overrides,
  };
}

beforeEach(() => {
  initTracker();
});

// ---------------------------------------------------------------------------
// initTracker
// ---------------------------------------------------------------------------

describe('initTracker', () => {
  it('clears the in-memory cache', () => {
    getNewStreams([makeStream()]);
    initTracker();
    expect(getActiveCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getNewStreams — tracks by user_login, not stream id
// ---------------------------------------------------------------------------

describe('getNewStreams', () => {
  it('returns a stream the first time it is seen', () => {
    const result = getNewStreams([makeStream({ user_login: 'streamer1' })]);
    expect(result).toHaveLength(1);
  });

  it('does not return the same streamer on the next poll', () => {
    const stream = makeStream({ user_login: 'streamer1' });
    getNewStreams([stream]);
    const result = getNewStreams([stream]);
    expect(result).toHaveLength(0);
  });

  it('treats the same streamer as known even when stream.id changes (Twitch CDN rotation)', () => {
    getNewStreams([makeStream({ user_login: 'streamer1', id: 'id-old' })]);
    // Same streamer, new stream ID (Twitch reconnect) — must NOT trigger a notification
    const result = getNewStreams([makeStream({ user_login: 'streamer1', id: 'id-new' })]);
    expect(result).toHaveLength(0);
  });

  it('adds all current streams to the active cache', () => {
    getNewStreams([
      makeStream({ user_login: 'a' }),
      makeStream({ user_login: 'b' }),
      makeStream({ user_login: 'c' }),
    ]);
    expect(getActiveCount()).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// removeEndedStreams — grace period: absent for GRACE_POLLS+1 polls
// ---------------------------------------------------------------------------

describe('removeEndedStreams', () => {
  it('does NOT declare a streamer ended after one missing poll (grace period)', () => {
    getNewStreams([makeStream({ user_login: 'a' }), makeStream({ user_login: 'b' })]);
    const ended = removeEndedStreams(new Set(['a']));
    expect(ended).toHaveLength(0);
  });

  it('declares a streamer ended after two consecutive missing polls', () => {
    getNewStreams([makeStream({ user_login: 'a' }), makeStream({ user_login: 'b' })]);
    removeEndedStreams(new Set(['a'])); // first miss — grace
    const ended = removeEndedStreams(new Set(['a'])); // second miss — confirmed
    expect(ended).toHaveLength(1);
    expect(ended[0].user_login).toBe('b');
  });

  it('removes a confirmed ended streamer from the active cache', () => {
    getNewStreams([makeStream({ user_login: 'a' }), makeStream({ user_login: 'b' })]);
    removeEndedStreams(new Set(['a']));
    removeEndedStreams(new Set(['a']));
    expect(getActiveCount()).toBe(1);
  });

  it('resets the grace counter when a streamer comes back', () => {
    getNewStreams([makeStream({ user_login: 'a' }), makeStream({ user_login: 'b' })]);
    removeEndedStreams(new Set(['a']));               // b: first miss
    getNewStreams([makeStream({ user_login: 'b' })]);  // b comes back — counter reset
    removeEndedStreams(new Set(['a', 'b']));           // b is present
    removeEndedStreams(new Set(['a']));               // b: first miss again
    const ended = removeEndedStreams(new Set(['a', 'b'])); // b came back again
    expect(ended.map((s) => s.user_login)).not.toContain('b');
  });

  it('returns empty array when no streamers have ended', () => {
    getNewStreams([makeStream({ user_login: 'a' })]);
    const ended = removeEndedStreams(new Set(['a']));
    expect(ended).toHaveLength(0);
  });

  it('does not send ended notification for a stream whose id changed but streamer is still live', () => {
    getNewStreams([makeStream({ user_login: 'a', id: 'old-id' })]);
    // Next poll: same streamer, new stream ID
    getNewStreams([makeStream({ user_login: 'a', id: 'new-id' })]);
    const ended = removeEndedStreams(new Set(['a']));
    expect(ended).toHaveLength(0);
  });
});
