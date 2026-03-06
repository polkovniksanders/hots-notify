import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TwitchStream } from '../src/twitch/streams';

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------
const mockActiveStream = {
  findMany: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
};

vi.mock('../src/db/client', () => ({
  getPrisma: () => ({ activeStream: mockActiveStream }),
}));

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

// Resets module-level Map state before each group via initTracker with empty DB.
async function resetTracker() {
  mockActiveStream.findMany.mockResolvedValue([]);
  await initTracker();
  mockActiveStream.upsert.mockResolvedValue({});
  mockActiveStream.deleteMany.mockResolvedValue({ count: 0 });
}

// ---------------------------------------------------------------------------
// initTracker
// ---------------------------------------------------------------------------

describe('initTracker', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads rows from DB into in-memory cache', async () => {
    mockActiveStream.findMany.mockResolvedValue([
      { id: '1', userLogin: 'user1', userName: 'User1', startedAt: '2026-03-07T10:00:00Z', seenAt: new Date() },
      { id: '2', userLogin: 'user2', userName: 'User2', startedAt: '2026-03-07T11:00:00Z', seenAt: new Date() },
    ]);

    await initTracker();

    expect(getActiveCount()).toBe(2);
  });

  it('returns false when DB has existing rows (not a fresh deploy)', async () => {
    mockActiveStream.findMany.mockResolvedValue([
      { id: '1', userLogin: 'user1', userName: 'User1', startedAt: '', seenAt: new Date() },
    ]);

    const result = await initTracker();

    expect(result).toBe(false);
  });

  it('returns true when DB is empty (fresh deploy)', async () => {
    mockActiveStream.findMany.mockResolvedValue([]);

    const result = await initTracker();

    expect(result).toBe(true);
  });

  it('does not mark restored streams as new on next getNewStreams call', async () => {
    mockActiveStream.findMany.mockResolvedValue([
      { id: '42', userLogin: 'streamer', userName: 'Streamer', startedAt: '2026-03-07T10:00:00Z', seenAt: new Date() },
    ]);
    mockActiveStream.upsert.mockResolvedValue({});

    await initTracker();

    const stream = makeStream({ id: '42' });
    const newStreams = await getNewStreams([stream]);

    expect(newStreams).toHaveLength(0);
    expect(mockActiveStream.upsert).not.toHaveBeenCalled();
  });

  it('returns empty cache when DB has no rows', async () => {
    mockActiveStream.findMany.mockResolvedValue([]);
    await initTracker();
    expect(getActiveCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getNewStreams
// ---------------------------------------------------------------------------

describe('getNewStreams', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetTracker();
  });

  it('returns new streams not seen before', async () => {
    const result = await getNewStreams([makeStream({ id: '10' })]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('10');
  });

  it('does not return already-tracked streams', async () => {
    const stream = makeStream({ id: '10' });
    await getNewStreams([stream]);
    const result = await getNewStreams([stream]);
    expect(result).toHaveLength(0);
  });

  it('persists new streams via upsert', async () => {
    const stream = makeStream({ id: '10' });
    await getNewStreams([stream]);

    expect(mockActiveStream.upsert).toHaveBeenCalledWith({
      where: { id: '10' },
      create: { id: '10', userLogin: 'testuser', userName: 'TestUser', startedAt: '2026-03-07T10:00:00Z' },
      update: {},
    });
  });

  it('does not call upsert when there are no new streams', async () => {
    const stream = makeStream({ id: '10' });
    await getNewStreams([stream]);
    vi.clearAllMocks();
    await getNewStreams([stream]);

    expect(mockActiveStream.upsert).not.toHaveBeenCalled();
  });

  it('updates getActiveCount with all current streams', async () => {
    await getNewStreams([makeStream({ id: '1' }), makeStream({ id: '2' }), makeStream({ id: '3' })]);
    expect(getActiveCount()).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// removeEndedStreams — grace period: stream must be absent for GRACE_POLLS+1
// polls (i.e. 2 calls) before being declared ended.
// ---------------------------------------------------------------------------

describe('removeEndedStreams', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetTracker();
  });

  it('does NOT declare a stream ended after just one missing poll (grace period)', async () => {
    await getNewStreams([makeStream({ id: '1' }), makeStream({ id: '2' })]);

    // Poll where id=2 is absent — first miss, should not be declared ended yet
    const ended = await removeEndedStreams(new Set(['1']));
    expect(ended).toHaveLength(0);
  });

  it('declares a stream ended after GRACE_POLLS+1 consecutive missing polls', async () => {
    const s1 = makeStream({ id: '1' });
    const s2 = makeStream({ id: '2' });
    await getNewStreams([s1, s2]);

    // First absence — grace period
    await removeEndedStreams(new Set(['1']));
    // Second consecutive absence — now truly ended
    const ended = await removeEndedStreams(new Set(['1']));

    expect(ended).toHaveLength(1);
    expect(ended[0].id).toBe('2');
  });

  it('removes a confirmed ended stream from the in-memory cache', async () => {
    await getNewStreams([makeStream({ id: '1' }), makeStream({ id: '2' })]);
    await removeEndedStreams(new Set(['1'])); // grace
    await removeEndedStreams(new Set(['1'])); // confirmed

    expect(getActiveCount()).toBe(1);
  });

  it('removes a confirmed ended stream from the DB', async () => {
    await getNewStreams([makeStream({ id: '1' }), makeStream({ id: '2' })]);
    await removeEndedStreams(new Set(['1'])); // grace
    vi.clearAllMocks();
    await removeEndedStreams(new Set(['1'])); // confirmed

    expect(mockActiveStream.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['2'] } },
    });
  });

  it('resets grace counter when a stream comes back', async () => {
    await getNewStreams([makeStream({ id: '1' }), makeStream({ id: '2' })]);

    await removeEndedStreams(new Set(['1'])); // id=2 first miss
    await getNewStreams([makeStream({ id: '2' })]); // id=2 comes back — counter reset
    await removeEndedStreams(new Set(['1', '2'])); // id=2 is present

    // After reset, id=2 needs 2 more misses — should not be ended yet
    await removeEndedStreams(new Set(['1'])); // first miss again
    const ended = await removeEndedStreams(new Set(['1', '2'])); // came back

    expect(ended.map((s) => s.id)).not.toContain('2');
  });

  it('does not call deleteMany when no streams are confirmed ended', async () => {
    await getNewStreams([makeStream({ id: '1' })]);
    await removeEndedStreams(new Set([])); // first miss — grace
    expect(mockActiveStream.deleteMany).not.toHaveBeenCalled();
  });

  it('returns empty array when nothing has ended', async () => {
    await getNewStreams([makeStream({ id: '1' })]);
    const ended = await removeEndedStreams(new Set(['1']));
    expect(ended).toHaveLength(0);
  });
});
