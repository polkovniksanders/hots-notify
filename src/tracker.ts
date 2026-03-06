import { TwitchStream } from './twitch/streams';

// Keyed by user_login (stable) — NOT stream.id, which Twitch can rotate
// mid-stream on CDN reconnects, causing false "new stream" notifications.
const activeStreams = new Map<string, TwitchStream>();
const missedPolls = new Map<string, number>();

// A streamer must be absent for GRACE_POLLS+1 consecutive polls before
// being declared offline. Absorbs transient Twitch API inconsistencies.
const GRACE_POLLS = 1;

export function getActiveCount(): number {
  return activeStreams.size;
}

export function getActiveStreams(): TwitchStream[] {
  return [...activeStreams.values()];
}

export function initTracker(): void {
  activeStreams.clear();
  missedPolls.clear();
}

export function getNewStreams(streams: TwitchStream[]): TwitchStream[] {
  const newStreams = streams.filter((s) => !activeStreams.has(s.user_login));
  for (const stream of streams) {
    activeStreams.set(stream.user_login, stream);
    missedPolls.delete(stream.user_login);
  }
  return newStreams;
}

export function removeEndedStreams(currentLogins: Set<string>): TwitchStream[] {
  const ended: TwitchStream[] = [];
  for (const [login, stream] of activeStreams) {
    if (currentLogins.has(login)) {
      missedPolls.delete(login);
      continue;
    }
    const missed = (missedPolls.get(login) ?? 0) + 1;
    if (missed > GRACE_POLLS) {
      ended.push(stream);
      activeStreams.delete(login);
      missedPolls.delete(login);
    } else {
      missedPolls.set(login, missed);
    }
  }
  return ended;
}
