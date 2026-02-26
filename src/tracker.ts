const seenStreamIds = new Set<string>();

export function getNewStreams<T extends { id: string }>(streams: T[]): T[] {
  const newStreams = streams.filter((s) => !seenStreamIds.has(s.id));
  for (const stream of newStreams) {
    seenStreamIds.add(stream.id);
  }
  return newStreams;
}

// Удаляем завершившиеся стримы, чтобы уведомить повторно если стример зайдёт снова
export function removeEndedStreams(activeIds: Set<string>): void {
  for (const id of seenStreamIds) {
    if (!activeIds.has(id)) {
      seenStreamIds.delete(id);
    }
  }
}
