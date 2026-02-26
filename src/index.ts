import { config } from './config';
import { getGameIdByName } from './twitch/games';
import { fetchRussianStreams } from './twitch/streams';
import { getNewStreams, removeEndedStreams } from './tracker';
import { sendStreamNotification } from './telegram/bot';
import { formatStreamMessage, formatStreamEndedMessage } from './telegram/formatter';

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

let gameId: string;

async function poll(): Promise<void> {
  try {
    const streams = await fetchRussianStreams(gameId);
    const activeIds = new Set(streams.map((s) => s.id));

    const endedStreams = removeEndedStreams(activeIds);
    for (const stream of endedStreams) {
      const message = formatStreamEndedMessage(stream);
      await sendStreamNotification(stream, message);
      log(`Stream ended: ${stream.user_name}`);
    }

    const newStreams = getNewStreams(streams);

    for (const stream of newStreams) {
      const caption = formatStreamMessage(stream);
      await sendStreamNotification(stream, caption);
      log(`Notified: ${stream.user_name} (${stream.viewer_count} viewers)`);
    }

    if (newStreams.length === 0) {
      log(`No new streams. Active RU streams: ${streams.length}`);
    }
  } catch (err) {
    log(`Poll error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main(): Promise<void> {
  log('hots-notify started');
  log(`Game: ${config.gameName}`);

  gameId = await getGameIdByName(config.gameName);
  log(`Game ID resolved: ${gameId}`);
  log(`Polling interval: ${config.pollingInterval / 1000}s`);

  await poll();
  setInterval(poll, config.pollingInterval);
}

main();
