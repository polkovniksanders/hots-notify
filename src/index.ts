import { config } from './config';
import { getGameIdByName } from './twitch/games';
import { fetchRussianStreams, TwitchStream } from './twitch/streams';
import { fetchTopClipsToday } from './twitch/clips';
import { initTracker, getNewStreams, removeEndedStreams, getActiveCount } from './tracker';
import { bot, sendStreamNotification, sendTextMessage, setActiveCountGetter } from './telegram/bot';
import { formatStreamMessage, formatStreamsEndedMessage, formatDigestMessage, formatSubscriberNotification } from './telegram/formatter';
import { recordStream, getDailyStats, shouldSendDigest, resetDailyStats } from './stats';
import { getProfile } from './db/profile';
import { getSubscribers, removeAllSubscriptions } from './db/subscription';
import { GrammyError } from 'grammy';

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function notifySubscribers(stream: TwitchStream): Promise<void> {
  const subscribers = await getSubscribers(stream.user_login);
  if (subscribers.length === 0) return;

  const message = formatSubscriberNotification(stream);

  await Promise.allSettled(
    subscribers.map(async (userId) => {
      try {
        await bot.api.sendMessage(Number(userId), message, { parse_mode: 'HTML' });
      } catch (err) {
        const isBlocked =
          err instanceof GrammyError &&
          (err.description.includes('bot was blocked by the user') ||
            err.description.includes('user is deactivated'));

        if (isBlocked) {
          log(`Subscriber ${userId} blocked the bot — removing subscriptions`);
          await removeAllSubscriptions(userId);
        } else {
          log(`Failed to notify ${userId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }),
  );
}

let gameId: string;
let botStartedAt = 0; // set in main(); streams started before this are not re-announced

async function poll(): Promise<void> {
  try {
    const streams = await fetchRussianStreams(gameId);
    const activeIds = new Set(streams.map((s) => s.id));

    // Уведомления об окончании стримов — одно сообщение на все завершённые
    const endedStreams = await removeEndedStreams(activeIds);
    if (endedStreams.length > 0) {
      const message = formatStreamsEndedMessage(endedStreams);
      await sendTextMessage(message);
      log(`Streams ended: ${endedStreams.map((s) => s.user_name).join(', ')}`);
    }

    // Уведомления о новых стримах
    // Стримы, начавшиеся ДО старта бота, добавляются в трекер без уведомления —
    // чтобы рестарт бота не спамил анонсами уже идущих стримов.
    const newStreams = await getNewStreams(streams);
    for (const stream of newStreams) {
      const streamStartedAt = new Date(stream.started_at).getTime();
      if (streamStartedAt < botStartedAt) {
        log(`Skipping notification for pre-existing stream: ${stream.user_name}`);
        continue;
      }
      const profile = await getProfile(stream.user_login);
      const caption = formatStreamMessage(stream, profile);
      await sendStreamNotification(stream, caption);
      await notifySubscribers(stream);
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
      const { count, top, date, avgPeakViewers } = getDailyStats();
      if (count > 0) {
        const clips = await fetchTopClipsToday(gameId).catch(() => []);
        const message = formatDigestMessage(count, top, date, avgPeakViewers, clips);
        await sendTextMessage(message);
        log(`Digest sent: ${count} streamers, ${clips.length} clips`);
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

  botStartedAt = Date.now();

  // Восстанавливаем состояние активных стримов из БД (защита от дублей при перезапуске)
  const freshDeploy = await initTracker();
  log(`Tracker state restored from DB${freshDeploy ? ' (fresh deployment — first poll silent)' : ''}`);

  // Передаём функцию получения активных стримов в бот для /stats
  setActiveCountGetter(getActiveCount);

  // Запускаем бот для обработки команд (/stats)
  bot.start({ onStart: () => log('Bot started, listening for commands') });

  await poll();
  setInterval(poll, config.pollingInterval);
}

main();
