import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TwitchStream } from '../src/twitch/streams';

// ---------------------------------------------------------------------------
// Prisma mock — must be set up before importing tracker
// ---------------------------------------------------------------------------
const mockActiveStream = {
  findMany: vi.fn(),
  createMany: vi.fn(),
  deleteMany: vi.fn(),
};

vi.mock('../src/db/client', () => ({
  getPrisma: () => ({ activeStream: mockActiveStream }),
}));

// tracker.ts uses module-level state; re-import fresh for each test via resetModules
import { initTracker, getNewStreams, removeEndedStreams, getActiveCount } from '../src/tracker';

function makeStream(overrides: Partial<TwitchStream> = {}): TwitchStream {
  return {
    id: '1',
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

// ---------------------------------------------------------------------------
// NOTE: tracker uses module-level Map state. Tests run in sequence and share
// that state. Each test group resets it via initTracker([]) before acting.
// ---------------------------------------------------------------------------

describe('initTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads rows from DB into in-memory cache', async () => {
    mockActiveStream.findMany.mockResolvedValue([
      { id: '1', userLogin: 'user1', userName: 'User1', startedAt: '2026-03-07T10:00:00Z', seenAt: new Date() },
      { id: '2', userLogin: 'user2', userName: 'User2', startedAt: '2026-03-07T11:00:00Z', seenAt: new Date() },
    ]);

    await initTracker();

    expect(getActiveCount()).toBe(2);
  });

  it('does not mark restored streams as new on next getNewStreams call', async () => {
    mockActiveStream.findMany.mockResolvedValue([
      { id: '42', userLogin: 'streamer', userName: 'Streamer', startedAt: '2026-03-07T10:00:00Z', seenAt: new Date() },
    ]);
    mockActiveStream.createMany.mockResolvedValue({ count: 0 });

    await initTracker();

    const stream = makeStream({ id: '42' });
    const newStreams = await getNewStreams([stream]);

    expect(newStreams).toHaveLength(0);
    expect(mockActiveStream.createMany).not.toHaveBeenCalled();
  });

  it('returns empty cache when DB has no rows', async () => {
    mockActiveStream.findMany.mockResolvedValue([]);

    await initTracker();

    expect(getActiveCount()).toBe(0);
  });
});

describe('getNewStreams', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset in-memory state by re-initialising with empty DB
    mockActiveStream.findMany.mockResolvedValue([]);
    await initTracker();
    mockActiveStream.createMany.mockResolvedValue({ count: 0 });
  });

  it('returns new streams not seen before', async () => {
    const stream = makeStream({ id: '10' });
    const result = await getNewStreams([stream]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('10');
  });

  it('does not return already-tracked streams', async () => {
    const stream = makeStream({ id: '10' });
    await getNewStreams([stream]);                     // first poll — marks as seen
    const result = await getNewStreams([stream]);      // second poll — same stream
    expect(result).toHaveLength(0);
  });

  it('persists new streams to the DB', async () => {
    const stream = makeStream({ id: '10' });
    await getNewStreams([stream]);

    expect(mockActiveStream.createMany).toHaveBeenCalledWith({
      data: [{ id: '10', userLogin: 'testuser', userName: 'TestUser', startedAt: '2026-03-07T10:00:00Z' }],
    });
  });

  it('does not call createMany when there are no new streams', async () => {
    const stream = makeStream({ id: '10' });
    await getNewStreams([stream]);          // first call — new
    vi.clearAllMocks();
    await getNewStreams([stream]);          // second call — not new

    expect(mockActiveStream.createMany).not.toHaveBeenCalled();
  });

  it('updates getActiveCount with all current streams', async () => {
    await getNewStreams([
      makeStream({ id: '1' }),
      makeStream({ id: '2' }),
      makeStream({ id: '3' }),
    ]);
    expect(getActiveCount()).toBe(3);
  });
});

describe('removeEndedStreams', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockActiveStream.findMany.mockResolvedValue([]);
    await initTracker();
    mockActiveStream.createMany.mockResolvedValue({ count: 0 });
    mockActiveStream.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('returns streams absent from the current poll', async () => {
    const s1 = makeStream({ id: '1' });
    const s2 = makeStream({ id: '2' });
    await getNewStreams([s1, s2]);

    // Only s1 is still live
    const ended = await removeEndedStreams(new Set(['1']));
    expect(ended).toHaveLength(1);
    expect(ended[0].id).toBe('2');
  });

  it('removes ended streams from the in-memory cache', async () => {
    await getNewStreams([makeStream({ id: '1' }), makeStream({ id: '2' })]);
    await removeEndedStreams(new Set(['1']));

    expect(getActiveCount()).toBe(1);
  });

  it('removes ended streams from the DB', async () => {
    await getNewStreams([makeStream({ id: '1' }), makeStream({ id: '2' })]);
    await removeEndedStreams(new Set(['1']));

    expect(mockActiveStream.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['2'] } },
    });
  });

  it('does not call deleteMany when no streams ended', async () => {
    await getNewStreams([makeStream({ id: '1' })]);
    await removeEndedStreams(new Set(['1']));

    expect(mockActiveStream.deleteMany).not.toHaveBeenCalled();
  });

  it('returns empty array when nothing ended', async () => {
    await getNewStreams([makeStream({ id: '1' })]);
    const ended = await removeEndedStreams(new Set(['1']));
    expect(ended).toHaveLength(0);
  });
});
