import { config } from './config';
import { getGameIdByName } from './twitch/games';
import { fetchRussianStreams, fetchStreamsByLogins, TwitchStream } from './twitch/streams';
import { fetchTopClipsToday } from './twitch/clips';
import { initTracker, getNewStreams, removeEndedStreams, getActiveCount } from './tracker';
// tracker operates in-memory only; no DB imports needed here
import { bot, sendStreamNotification, sendStreamToChat, sendTextMessage, setActiveCountGetter } from './telegram/bot';
import { formatStreamMessage, formatStreamsEndedMessage, formatDigestMessage, formatSubscriberNotification } from './telegram/formatter';
import { recordStream, getDailyStats, shouldSendDigest, resetDailyStats } from './stats';
import { getProfile } from './db/profile';
import { getSubscribers, removeAllSubscriptions } from './db/subscription';
import { getChannelsByStreamer, getSubscribedStreamerLogins, removeChannelSubscription } from './db/channel';
import { GrammyError } from 'grammy';

const FAST_POLL_INTERVAL_MS = 30_000;

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

/**
 * Sends a stream notification to all Telegram channels linked to this streamer.
 * Auto-removes channels where the bot was kicked or the chat no longer exists.
 */
async function notifyLinkedChannels(
  stream: TwitchStream,
  caption: string,
  thumbnailPath?: string | null,
): Promise<void> {
  const channels = await getChannelsByStreamer(stream.user_login);
  if (channels.length === 0) return;

  await Promise.allSettled(
    channels.map(async ({ chatId }) => {
      try {
        await sendStreamToChat(chatId, stream, caption, thumbnailPath);
      } catch (err) {
        const isKicked =
          err instanceof GrammyError &&
          (err.description.includes('bot was kicked') ||
            err.description.includes('chat not found') ||
            err.description.includes('bot is not a member'));

        if (isKicked) {
          log(`Channel ${chatId} is inaccessible — removing channel subscription`);
          await removeChannelSubscription(chatId);
        } else {
          log(`Failed to notify channel ${chatId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }),
  );
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

/**
 * Fast poll: runs every 30s only for streamers with a linked Telegram channel.
 * Shares the main tracker → prevents double-notifications from the regular poll.
 * Gives ~15-30s detection time vs 120s for the regular poll.
 */
async function fastPoll(): Promise<void> {
  try {
    const logins = await getSubscribedStreamerLogins();
    if (logins.length === 0) return;

    const streams = await fetchStreamsByLogins(logins);
    const newStreams = getNewStreams(streams);

    for (const stream of newStreams) {
      const streamStartedAt = new Date(stream.started_at).getTime();
      if (streamStartedAt < botStartedAt) continue;

      const profile = await getProfile(stream.user_login);
      const caption = formatStreamMessage(stream, profile);

      await sendStreamNotification(stream, caption, profile?.thumbnailPath);
      await notifySubscribers(stream);
      await notifyLinkedChannels(stream, caption, profile?.thumbnailPath);
      recordStream(stream);
      log(`[fast-poll] Notified: ${stream.user_name} (${stream.viewer_count} viewers)`);
    }
  } catch (err) {
    log(`Fast poll error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function poll(): Promise<void> {
  try {
    const streams = await fetchRussianStreams(gameId);
    const activeLogins = new Set(streams.map((s) => s.user_login));

    // Уведомления об окончании стримов — одно сообщение на все завершённые
    const endedStreams = removeEndedStreams(activeLogins);
    if (endedStreams.length > 0) {
      const message = formatStreamsEndedMessage(endedStreams);
      await sendTextMessage(message);
      log(`Streams ended: ${endedStreams.map((s) => s.user_name).join(', ')}`);
    }

    // Уведомления о новых стримах
    // Стримы, начавшиеся ДО старта бота, добавляются в трекер без уведомления —
    // чтобы рестарт бота не спамил анонсами уже идущих стримов.
    const newStreams = getNewStreams(streams);
    for (const stream of newStreams) {
      const streamStartedAt = new Date(stream.started_at).getTime();
      if (streamStartedAt < botStartedAt) {
        log(`Skipping notification for pre-existing stream: ${stream.user_name}`);
        continue;
      }
      const profile = await getProfile(stream.user_login);
      const caption = formatStreamMessage(stream, profile);
      await sendStreamNotification(stream, caption, profile?.thumbnailPath);
      await notifySubscribers(stream);
      await notifyLinkedChannels(stream, caption, profile?.thumbnailPath);
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
  initTracker();
  log('Tracker initialized');

  // Передаём функцию получения активных стримов в бот для /stats
  setActiveCountGetter(getActiveCount);

  // Запускаем бот для обработки команд (/stats)
  bot.start({ onStart: () => log('Bot started, listening for commands') });

  await poll();
  setInterval(poll, config.pollingInterval);

  // Fast poll for streamers with linked channels — shares main tracker, no double-notifications
  setInterval(fastPoll, FAST_POLL_INTERVAL_MS);
  log(`Fast poll started (interval: ${FAST_POLL_INTERVAL_MS / 1000}s)`);
}

main();
