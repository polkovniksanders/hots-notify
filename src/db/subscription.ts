import { getPrisma } from './client';

export async function subscribe(
  userId: bigint,
  streamerLogin: string,
): Promise<'created' | 'exists'> {
  const existing = await getPrisma().subscription.findUnique({
    where: { userId_streamerLogin: { userId, streamerLogin } },
  });
  if (existing) return 'exists';

  await getPrisma().subscription.create({ data: { userId, streamerLogin } });
  return 'created';
}

export async function unsubscribe(userId: bigint, streamerLogin: string): Promise<boolean> {
  const result = await getPrisma().subscription.deleteMany({
    where: { userId, streamerLogin },
  });
  return result.count > 0;
}

export async function getSubscriptions(userId: bigint): Promise<string[]> {
  const rows = await getPrisma().subscription.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => r.streamerLogin);
}

export async function getSubscribers(streamerLogin: string): Promise<bigint[]> {
  const rows = await getPrisma().subscription.findMany({
    where: { streamerLogin },
  });
  return rows.map((r) => r.userId);
}

export async function removeAllSubscriptions(userId: bigint): Promise<void> {
  await getPrisma().subscription.deleteMany({ where: { userId } });
}
