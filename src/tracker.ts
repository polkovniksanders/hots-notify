import { TwitchStream } from './twitch/streams';
import { getPrisma } from './db/client';

// In-memory cache — source of truth for the current process.
// Populated from DB on startup so restarts are idempotent.
const activeStreams = new Map<string, TwitchStream>();

export function getActiveCount(): number {
  return activeStreams.size;
}

export function getActiveStreams(): TwitchStream[] {
  return [...activeStreams.values()];
}

/**
 * Loads previously-active streams from the DB into memory.
 * Must be called once before the first poll.
 */
export async function initTracker(): Promise<void> {
  activeStreams.clear();
  const rows = await getPrisma().activeStream.findMany();
  for (const row of rows) {
    // Reconstruct a minimal TwitchStream from the stored fields.
    // Fields not needed for the "ended" notification are left as defaults.
    activeStreams.set(row.id, {
      id: row.id,
      user_login: row.userLogin,
      user_name: row.userName,
      started_at: row.startedAt,
      game_name: '',
      title: '',
      viewer_count: 0,
      thumbnail_url: '',
      tags: [],
      is_mature: false,
    });
  }
}

/**
 * Returns streams that haven't been seen before, and persists them to the DB.
 * Updates the in-memory cache with the full stream data for all current streams.
 */
export async function getNewStreams(streams: TwitchStream[]): Promise<TwitchStream[]> {
  const newStreams = streams.filter((s) => !activeStreams.has(s.id));

  for (const stream of streams) {
    activeStreams.set(stream.id, stream);
  }

  if (newStreams.length > 0) {
    await getPrisma().activeStream.createMany({
      data: newStreams.map((s) => ({
        id: s.id,
        userLogin: s.user_login,
        userName: s.user_name,
        startedAt: s.started_at,
      })),
    });
  }

  return newStreams;
}

/**
 * Finds streams no longer in the current poll, removes them from cache and DB,
 * and returns them so the caller can send "ended" notifications.
 */
export async function removeEndedStreams(currentIds: Set<string>): Promise<TwitchStream[]> {
  const ended: TwitchStream[] = [];
  const endedIds: string[] = [];

  for (const [id, stream] of activeStreams) {
    if (!currentIds.has(id)) {
      ended.push(stream);
      endedIds.push(id);
      activeStreams.delete(id);
    }
  }

  if (endedIds.length > 0) {
    await getPrisma().activeStream.deleteMany({
      where: { id: { in: endedIds } },
    });
  }

  return ended;
}
