import { TwitchStream } from './twitch/streams';
import { getPrisma } from './db/client';

// In-memory cache — source of truth for the current process.
// Populated from DB on startup so restarts are idempotent.
const activeStreams = new Map<string, TwitchStream>();

// Tracks how many consecutive polls a stream has been absent.
// A stream must be missing for GRACE_POLLS+1 polls before being declared ended.
// This absorbs transient Twitch API inconsistencies (common with short polling intervals).
const missedPolls = new Map<string, number>();
const GRACE_POLLS = 1;

export function getActiveCount(): number {
  return activeStreams.size;
}

export function getActiveStreams(): TwitchStream[] {
  return [...activeStreams.values()];
}

/**
 * Loads previously-active streams from the DB into memory.
 * Returns true if the DB was empty (first run / fresh deployment).
 * Must be called once before the first poll.
 */
export async function initTracker(): Promise<boolean> {
  activeStreams.clear();
  missedPolls.clear();

  const rows = await getPrisma().activeStream.findMany();
  for (const row of rows) {
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

  return rows.length === 0;
}

/**
 * Returns streams not seen before and persists them to the DB.
 * Uses upsert to safely handle any duplicate-key edge cases.
 */
export async function getNewStreams(streams: TwitchStream[]): Promise<TwitchStream[]> {
  const newStreams = streams.filter((s) => !activeStreams.has(s.id));

  for (const stream of streams) {
    activeStreams.set(stream.id, stream);
    missedPolls.delete(stream.id); // stream is present — reset any grace counter
  }

  for (const s of newStreams) {
    await getPrisma().activeStream.upsert({
      where: { id: s.id },
      create: { id: s.id, userLogin: s.user_login, userName: s.user_name, startedAt: s.started_at },
      update: {},
    });
  }

  return newStreams;
}

/**
 * Finds streams absent from the current poll.
 * A stream must be missing for GRACE_POLLS+1 consecutive polls before being
 * declared ended — this prevents false "ended" events from Twitch API blips.
 */
export async function removeEndedStreams(currentIds: Set<string>): Promise<TwitchStream[]> {
  const ended: TwitchStream[] = [];
  const endedIds: string[] = [];

  for (const [id, stream] of activeStreams) {
    if (currentIds.has(id)) {
      missedPolls.delete(id); // still live — clear counter
      continue;
    }

    const missed = (missedPolls.get(id) ?? 0) + 1;

    if (missed > GRACE_POLLS) {
      ended.push(stream);
      endedIds.push(id);
      activeStreams.delete(id);
      missedPolls.delete(id);
    } else {
      missedPolls.set(id, missed);
    }
  }

  if (endedIds.length > 0) {
    await getPrisma().activeStream.deleteMany({
      where: { id: { in: endedIds } },
    });
  }

  return ended;
}
