import { TwitchStream } from './twitch/streams';

const activeStreams = new Map<string, TwitchStream>();

export function getActiveCount(): number {
  return activeStreams.size;
}

export function getNewStreams(streams: TwitchStream[]): TwitchStream[] {
  const newStreams = streams.filter((s) => !activeStreams.has(s.id));
  for (const stream of streams) {
    activeStreams.set(stream.id, stream);
  }
  return newStreams;
}

export function removeEndedStreams(currentIds: Set<string>): TwitchStream[] {
  const ended: TwitchStream[] = [];
  for (const [id, stream] of activeStreams) {
    if (!currentIds.has(id)) {
      ended.push(stream);
      activeStreams.delete(id);
    }
  }
  return ended;
}
