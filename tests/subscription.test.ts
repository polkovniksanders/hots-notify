import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSubscription = {
  findUnique: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
  findMany: vi.fn(),
};

vi.mock('../src/db/client', () => ({
  getPrisma: () => ({ subscription: mockSubscription }),
}));

import {
  subscribe,
  unsubscribe,
  getSubscriptions,
  getSubscribers,
  removeAllSubscriptions,
} from '../src/db/subscription';

const USER_A = BigInt(111);
const USER_B = BigInt(222);
const LOGIN = 'zloyeugene';

describe('subscribe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a new subscription and returns "created"', async () => {
    mockSubscription.findUnique.mockResolvedValue(null);
    mockSubscription.create.mockResolvedValue({});

    const result = await subscribe(USER_A, LOGIN);

    expect(result).toBe('created');
    expect(mockSubscription.create).toHaveBeenCalledWith({
      data: { userId: USER_A, streamerLogin: LOGIN },
    });
  });

  it('returns "exists" without creating when already subscribed', async () => {
    mockSubscription.findUnique.mockResolvedValue({ id: 1, userId: USER_A, streamerLogin: LOGIN });

    const result = await subscribe(USER_A, LOGIN);

    expect(result).toBe('exists');
    expect(mockSubscription.create).not.toHaveBeenCalled();
  });

  it('looks up by composite unique key', async () => {
    mockSubscription.findUnique.mockResolvedValue(null);
    mockSubscription.create.mockResolvedValue({});

    await subscribe(USER_A, LOGIN);

    expect(mockSubscription.findUnique).toHaveBeenCalledWith({
      where: { userId_streamerLogin: { userId: USER_A, streamerLogin: LOGIN } },
    });
  });
});

describe('unsubscribe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when a subscription was deleted', async () => {
    mockSubscription.deleteMany.mockResolvedValue({ count: 1 });

    const result = await unsubscribe(USER_A, LOGIN);

    expect(result).toBe(true);
  });

  it('returns false when no subscription existed', async () => {
    mockSubscription.deleteMany.mockResolvedValue({ count: 0 });

    const result = await unsubscribe(USER_A, LOGIN);

    expect(result).toBe(false);
  });
});

describe('getSubscriptions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns list of streamer logins for a user', async () => {
    mockSubscription.findMany.mockResolvedValue([
      { streamerLogin: 'streamer1' },
      { streamerLogin: 'streamer2' },
    ]);

    const result = await getSubscriptions(USER_A);

    expect(result).toEqual(['streamer1', 'streamer2']);
  });

  it('returns empty array when user has no subscriptions', async () => {
    mockSubscription.findMany.mockResolvedValue([]);

    const result = await getSubscriptions(USER_A);

    expect(result).toEqual([]);
  });

  it('orders by createdAt ascending', async () => {
    mockSubscription.findMany.mockResolvedValue([]);

    await getSubscriptions(USER_A);

    expect(mockSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
    );
  });
});

describe('getSubscribers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns user IDs subscribed to a streamer', async () => {
    mockSubscription.findMany.mockResolvedValue([
      { userId: USER_A },
      { userId: USER_B },
    ]);

    const result = await getSubscribers(LOGIN);

    expect(result).toEqual([USER_A, USER_B]);
  });

  it('returns empty array when no one is subscribed', async () => {
    mockSubscription.findMany.mockResolvedValue([]);

    const result = await getSubscribers(LOGIN);

    expect(result).toEqual([]);
  });
});

describe('removeAllSubscriptions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes all subscriptions for a user', async () => {
    mockSubscription.deleteMany.mockResolvedValue({ count: 3 });

    await removeAllSubscriptions(USER_A);

    expect(mockSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_A } });
  });
});
