import { getPrisma } from './client';

export interface ChannelSubscription {
  chatId: bigint;
  streamerLogin: string;
}

export async function addChannelSubscription(
  chatId: bigint,
  streamerLogin: string,
): Promise<void> {
  const login = streamerLogin.toLowerCase();
  await getPrisma().channelSubscription.upsert({
    where: { chatId },
    create: { chatId, streamerLogin: login },
    update: { streamerLogin: login },
  });
}

export async function removeChannelSubscription(chatId: bigint): Promise<boolean> {
  const result = await getPrisma().channelSubscription.deleteMany({ where: { chatId } });
  return result.count > 0;
}

export async function getChannelSubscription(
  chatId: bigint,
): Promise<ChannelSubscription | null> {
  return getPrisma().channelSubscription.findUnique({ where: { chatId } });
}

export async function getChannelsByStreamer(
  streamerLogin: string,
): Promise<ChannelSubscription[]> {
  return getPrisma().channelSubscription.findMany({
    where: { streamerLogin: streamerLogin.toLowerCase() },
  });
}

export async function getAllChannelSubscriptions(): Promise<ChannelSubscription[]> {
  return getPrisma().channelSubscription.findMany({ orderBy: { createdAt: 'asc' } });
}

/** Returns a deduplicated list of all streamer logins that have a linked channel. */
export async function getSubscribedStreamerLogins(): Promise<string[]> {
  const subs = await getPrisma().channelSubscription.findMany({
    select: { streamerLogin: true },
  });
  return [...new Set(subs.map((s) => s.streamerLogin))];
}
