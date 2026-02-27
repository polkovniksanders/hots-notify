import { config } from './config';
import { getGameIdByName } from './twitch/games';
import { fetchRussianStreams } from './twitch/streams';
import { getNewStreams, removeEndedStreams, getActiveCount } from './tracker';
import { bot, sendStreamNotification, sendTextMessage, setActiveCountGetter } from './telegram/bot';
import { formatStreamMessage, formatStreamEndedMessage, formatDigestMessage } from './telegram/formatter';
import { recordStream, getDailyStats, shouldSendDigest, resetDailyStats } from './stats';

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

let gameId: string;

async function poll(): Promise<void> {
  try {
    const streams = await fetchRussianStreams(gameId);
    const activeIds = new Set(streams.map((s) => s.id));

    // Уведомления об окончании стримов
    const endedStreams = removeEndedStreams(activeIds);
    for (const stream of endedStreams) {
      const message = formatStreamEndedMessage(stream);
      await sendTextMessage(message);
      log(`Stream ended: ${stream.user_name}`);
    }

    // Уведомления о новых стримах
    const newStreams = getNewStreams(streams);
    for (const stream of newStreams) {
      const caption = formatStreamMessage(stream);
      await sendStreamNotification(stream, caption);
      log(`Notified: ${stream.user_name} (${stream.viewer_count} viewers)`);
    }

    // Обновляем статистику для всех активных стримов (пиковые зрители)
    for (const stream of streams) {
      recordStream(stream);
    }

    if (newStreams.length === 0 && endedStreams.length === 0) {
      log(`No changes. Active RU streams: ${streams.length}`);
    }

    // Проверяем нужно ли отправить дайджест
    if (shouldSendDigest(config.digestHour)) {
      const { count, top } = getDailyStats();
      if (count > 0) {
        const message = formatDigestMessage(count, top);
        await sendTextMessage(message);
        log(`Digest sent: ${count} streamers`);
      }
      resetDailyStats();
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
  log(`Digest hour (UTC): ${config.digestHour}:00`);

  // Передаём функцию получения активных стримов в бот для /stats
  setActiveCountGetter(getActiveCount);

  // Запускаем бот для обработки команд (/stats)
  bot.start({ onStart: () => log('Bot started, listening for commands') });

  await poll();
  setInterval(poll, config.pollingInterval);
}

main();
