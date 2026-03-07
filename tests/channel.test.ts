import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockChannel = {
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
};

vi.mock('../src/db/client', () => ({
  getPrisma: () => ({ channelSubscription: mockChannel }),
}));

import {
  addChannelSubscription,
  removeChannelSubscription,
  getChannelSubscription,
  getChannelsByStreamer,
  getAllChannelSubscriptions,
  getSubscribedStreamerLogins,
} from '../src/db/channel';

const CHAT_A = BigInt('-1001111111111');
const CHAT_B = BigInt('-1002222222222');
const LOGIN = 'zloyeugene';

// ---------------------------------------------------------------------------
// addChannelSubscription
// ---------------------------------------------------------------------------

describe('addChannelSubscription', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts with the given chatId and lowercased login', async () => {
    mockChannel.upsert.mockResolvedValue({});

    await addChannelSubscription(CHAT_A, 'ZloyEugene');

    const call = mockChannel.upsert.mock.calls[0][0];
    expect(call.where.chatId).toBe(CHAT_A);
    expect(call.create.chatId).toBe(CHAT_A);
    expect(call.create.streamerLogin).toBe('zloyeugene');
    expect(call.update.streamerLogin).toBe('zloyeugene');
  });

  it('lowercases the login', async () => {
    mockChannel.upsert.mockResolvedValue({});

    await addChannelSubscription(CHAT_A, 'STREAMER');

    const call = mockChannel.upsert.mock.calls[0][0];
    expect(call.create.streamerLogin).toBe('streamer');
  });

  it('updates the streamer login when the channel is re-registered', async () => {
    mockChannel.upsert.mockResolvedValue({});

    await addChannelSubscription(CHAT_A, 'newstreamer');

    const call = mockChannel.upsert.mock.calls[0][0];
    expect(call.update.streamerLogin).toBe('newstreamer');
  });
});

// ---------------------------------------------------------------------------
// removeChannelSubscription
// ---------------------------------------------------------------------------

describe('removeChannelSubscription', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when the subscription was removed', async () => {
    mockChannel.deleteMany.mockResolvedValue({ count: 1 });

    const result = await removeChannelSubscription(CHAT_A);

    expect(result).toBe(true);
  });

  it('returns false when the channel was not registered', async () => {
    mockChannel.deleteMany.mockResolvedValue({ count: 0 });

    const result = await removeChannelSubscription(CHAT_A);

    expect(result).toBe(false);
  });

  it('deletes by chatId', async () => {
    mockChannel.deleteMany.mockResolvedValue({ count: 1 });

    await removeChannelSubscription(CHAT_B);

    expect(mockChannel.deleteMany).toHaveBeenCalledWith({ where: { chatId: CHAT_B } });
  });
});

// ---------------------------------------------------------------------------
// getChannelSubscription
// ---------------------------------------------------------------------------

describe('getChannelSubscription', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when channel is not registered', async () => {
    mockChannel.findUnique.mockResolvedValue(null);

    const result = await getChannelSubscription(CHAT_A);

    expect(result).toBeNull();
  });

  it('returns the subscription when found', async () => {
    const sub = { chatId: CHAT_A, streamerLogin: LOGIN };
    mockChannel.findUnique.mockResolvedValue(sub);

    const result = await getChannelSubscription(CHAT_A);

    expect(result).toEqual(sub);
  });

  it('looks up by chatId', async () => {
    mockChannel.findUnique.mockResolvedValue(null);

    await getChannelSubscription(CHAT_A);

    expect(mockChannel.findUnique).toHaveBeenCalledWith({ where: { chatId: CHAT_A } });
  });
});

// ---------------------------------------------------------------------------
// getChannelsByStreamer
// ---------------------------------------------------------------------------

describe('getChannelsByStreamer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all channels linked to the streamer', async () => {
    const subs = [
      { chatId: CHAT_A, streamerLogin: LOGIN },
      { chatId: CHAT_B, streamerLogin: LOGIN },
    ];
    mockChannel.findMany.mockResolvedValue(subs);

    const result = await getChannelsByStreamer(LOGIN);

    expect(result).toHaveLength(2);
  });

  it('lowercases the login when querying', async () => {
    mockChannel.findMany.mockResolvedValue([]);

    await getChannelsByStreamer('ZloyEugene');

    expect(mockChannel.findMany).toHaveBeenCalledWith({
      where: { streamerLogin: 'zloyeugene' },
    });
  });

  it('returns empty array when no channels linked', async () => {
    mockChannel.findMany.mockResolvedValue([]);

    const result = await getChannelsByStreamer('nobody');

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getAllChannelSubscriptions
// ---------------------------------------------------------------------------

describe('getAllChannelSubscriptions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all subscriptions ordered by createdAt', async () => {
    mockChannel.findMany.mockResolvedValue([]);

    await getAllChannelSubscriptions();

    expect(mockChannel.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'asc' } });
  });

  it('returns empty array when no channels registered', async () => {
    mockChannel.findMany.mockResolvedValue([]);

    const result = await getAllChannelSubscriptions();

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getSubscribedStreamerLogins
// ---------------------------------------------------------------------------

describe('getSubscribedStreamerLogins', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a deduplicated list of streamer logins', async () => {
    mockChannel.findMany.mockResolvedValue([
      { streamerLogin: 'zloyeugene' },
      { streamerLogin: 'zloyeugene' },
      { streamerLogin: 'otherstreamer' },
    ]);

    const result = await getSubscribedStreamerLogins();

    expect(result).toEqual(['zloyeugene', 'otherstreamer']);
  });

  it('returns empty array when no channels registered', async () => {
    mockChannel.findMany.mockResolvedValue([]);

    const result = await getSubscribedStreamerLogins();

    expect(result).toEqual([]);
  });

  it('queries only the streamerLogin field', async () => {
    mockChannel.findMany.mockResolvedValue([]);

    await getSubscribedStreamerLogins();

    expect(mockChannel.findMany).toHaveBeenCalledWith({
      select: { streamerLogin: true },
    });
  });
});
