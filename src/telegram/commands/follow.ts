import { Bot, Context, GrammyError, InlineKeyboard } from 'grammy';
import { getTwitchUser } from '../../twitch/users';
import { subscribe, unsubscribe, getSubscriptions } from '../../db/subscription';
import { getActiveStreams } from '../../tracker';
import { config } from '../../config';

const SUGGESTION_LIMIT = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCantInitiateError(err: unknown): boolean {
  return (
    err instanceof GrammyError &&
    err.error_code === 403 &&
    err.description.includes("can't initiate conversation")
  );
}

function buildDeepLink(login: string): string | undefined {
  return config.botName ? `https://t.me/${config.botName}?start=follow_${login}` : undefined;
}

function buildSuggestionKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const streams = getActiveStreams()
    .sort((a, b) => b.viewer_count - a.viewer_count)
    .slice(0, SUGGESTION_LIMIT);

  for (const stream of streams) {
    const viewers = stream.viewer_count.toLocaleString('ru-RU');
    keyboard.text(`🔴 ${stream.user_name} (${viewers} зрит.)`, `subscribe:${stream.user_login}`).row();
  }
  return keyboard;
}

// ---------------------------------------------------------------------------
// Core subscribe logic — shared between all entry points
// ---------------------------------------------------------------------------

interface FollowResult {
  text: string;
  status: 'created' | 'exists' | 'not_found';
}

async function processFollow(userId: bigint, login: string): Promise<FollowResult> {
  const twitchUser = await getTwitchUser(login);
  if (!twitchUser) {
    return {
      text: `❌ Стример <code>${login}</code> не найден на Twitch.`,
      status: 'not_found',
    };
  }

  const result = await subscribe(userId, twitchUser.login);
  if (result === 'exists') {
    return {
      text: `ℹ️ Ты уже подписан на <b>${twitchUser.display_name}</b>.`,
      status: 'exists',
    };
  }
  return {
    text: `✅ Подписан на <b>${twitchUser.display_name}</b>!\nУведомлю тебя когда начнётся стрим.`,
    status: 'created',
  };
}

/**
 * Runs the subscribe flow when the bot is already in a DM context
 * (commands /follow and /start with deep link parameter).
 */
async function handleFollowAction(ctx: Context, login: string): Promise<void> {
  const { text } = await processFollow(BigInt(ctx.from!.id), login);
  await ctx.reply(text, { parse_mode: 'HTML' });
}

// ---------------------------------------------------------------------------
// Command and callback registration
// ---------------------------------------------------------------------------

export function registerFollowCommands(bot: Bot): void {
  // /start [follow_<login>] — handles deep links from the "Subscribe" button
  // when the user has never messaged the bot before.
  bot.command('start', async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const param = (ctx.match ?? '').trim();
    if (param.startsWith('follow_')) {
      const login = param.slice('follow_'.length).toLowerCase();
      await handleFollowAction(ctx, login);
    }
  });

  // /follow [<login>]
  bot.command('follow', async (ctx) => {
    if (ctx.chat.type !== 'private') {
      await ctx.reply('Команда работает только в личном чате с ботом.');
      return;
    }

    const login = (ctx.match ?? '').trim().toLowerCase();

    if (!login) {
      const streams = getActiveStreams();
      const hasLive = streams.length > 0;
      const text = [
        `🎮 <b>Подписка на стримера HotS</b>`,
        ``,
        `Введи: <code>/follow twitch_login</code>`,
        ...(hasLive ? [``, `Или выбери кого-то из тех, кто сейчас в эфире:`] : []),
      ].join('\n');

      await ctx.reply(text, {
        parse_mode: 'HTML',
        ...(hasLive ? { reply_markup: buildSuggestionKeyboard() } : {}),
      });
      return;
    }

    await handleFollowAction(ctx, login);
  });

  // /unfollow <login>
  bot.command('unfollow', async (ctx) => {
    if (ctx.chat.type !== 'private') {
      await ctx.reply('Команда работает только в личном чате с ботом.');
      return;
    }

    const login = (ctx.match ?? '').trim().toLowerCase();
    if (!login) {
      await ctx.reply('Использование: /unfollow <twitch_login>');
      return;
    }

    const removed = await unsubscribe(BigInt(ctx.from!.id), login);
    await ctx.reply(
      removed
        ? `✅ Отписан от <b>${login}</b>.`
        : `ℹ️ Ты не подписан на <b>${login}</b>.`,
      { parse_mode: 'HTML' },
    );
  });

  // /follows — list subscriptions
  bot.command('follows', async (ctx) => {
    if (ctx.chat.type !== 'private') {
      await ctx.reply('Команда работает только в личном чате с ботом.');
      return;
    }

    const subs = await getSubscriptions(BigInt(ctx.from!.id));
    if (subs.length === 0) {
      await ctx.reply(
        'У тебя нет подписок.\n\nВведи <code>/follow twitch_login</code> чтобы подписаться.',
        { parse_mode: 'HTML' },
      );
      return;
    }

    const list = subs.map((s) => `• <code>${s}</code>`).join('\n');
    await ctx.reply(`📋 <b>Твои подписки (${subs.length}):</b>\n\n${list}`, {
      parse_mode: 'HTML',
    });
  });

  // subscribe:<login> — unified callback for both:
  //   • Stream card button in the group (DM the user)
  //   • /follow suggestion keyboard in private DM
  bot.callbackQuery(/^subscribe:(.+)$/, async (ctx) => {
    const login = ctx.match[1];

    // From the suggestion list in DM: just reply in the DM context.
    if (ctx.chat?.type === 'private') {
      await ctx.answerCallbackQuery();
      await handleFollowAction(ctx, login);
      return;
    }

    // From the stream card in a group/channel:
    // Try to DM the result. Handle the case where the user never started the bot.
    const { text, status } = await processFollow(BigInt(ctx.from.id), login);

    try {
      await ctx.api.sendMessage(ctx.from.id, text, { parse_mode: 'HTML' });
      await ctx.answerCallbackQuery({ text: 'Проверь личные сообщения 💬' });
    } catch (err) {
      if (!isCantInitiateError(err)) {
        await ctx.answerCallbackQuery({ text: 'Не удалось. Попробуй позже.' });
        return;
      }

      // User hasn't started the bot yet — can't send DM.
      if (status === 'exists') {
        // Already subscribed — a simple popup is enough, no need to open the bot.
        await ctx.answerCallbackQuery({
          text: `ℹ️ Ты уже подписан на ${login}`,
          show_alert: true,
        });
      } else {
        // Redirect via deep link: opens the bot and processes the subscription.
        const deepLink = buildDeepLink(login);
        await ctx.answerCallbackQuery(
          deepLink
            ? { url: deepLink }
            : { text: `Напиши боту: /follow ${login}`, show_alert: true },
        );
      }
    }
  });
}
