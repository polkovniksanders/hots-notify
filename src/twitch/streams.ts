import axios from 'axios';
import { config } from '../config';
import { getAccessToken } from './auth';

export interface TwitchStream {
  id: string;
  user_login: string;
  user_name: string;
  game_name: string;
  title: string;
  viewer_count: number;
  started_at: string;
  thumbnail_url: string;
  tags: string[];
  is_mature: boolean;
}

const CYRILLIC_RE = /[а-яёА-ЯЁ]/;
const RU_TAGS = new Set(['русский', 'russian', 'ru', 'рус']);

/**
 * Returns true if the stream's title contains Cyrillic characters
 * or tags include a Russian-language marker.
 * Used to catch streamers who set their channel language incorrectly.
 */
export function isRussianByContent(stream: TwitchStream): boolean {
  if (CYRILLIC_RE.test(stream.title)) return true;
  return stream.tags.some((tag) => RU_TAGS.has(tag.toLowerCase()));
}

interface StreamsRequestParams {
  language?: string;
}

async function fetchStreams(
  gameId: string,
  params: StreamsRequestParams,
): Promise<TwitchStream[]> {
  const token = await getAccessToken();
  const response = await axios.get('https://api.twitch.tv/helix/streams', {
    headers: {
      'Client-ID': config.twitchClientId,
      Authorization: `Bearer ${token}`,
    },
    params: { game_id: gameId, first: 100, ...params },
  });
  return response.data.data as TwitchStream[];
}

/**
 * Fetches current live streams for a specific list of Twitch logins.
 * Used for fast-polling channels that have a linked streamer.
 * Returns only the streams that are currently live.
 */
export async function fetchStreamsByLogins(logins: string[]): Promise<TwitchStream[]> {
  if (logins.length === 0) return [];
  const token = await getAccessToken();
  // URLSearchParams handles repeated user_login params correctly
  const params = new URLSearchParams({ first: '100' });
  for (const login of logins) params.append('user_login', login);
  const response = await axios.get(
    `https://api.twitch.tv/helix/streams?${params.toString()}`,
    {
      headers: {
        'Client-ID': config.twitchClientId,
        Authorization: `Bearer ${token}`,
      },
    },
  );
  return response.data.data as TwitchStream[];
}

/**
 * Fetches Russian HotS streams using two strategies:
 * 1. Official language=ru filter (fast, but misses streamers with wrong language set)
 * 2. All streams filtered by Cyrillic title or Russian tags (catches the rest)
 * Results are deduplicated by stream id.
 */
export async function fetchRussianStreams(gameId: string): Promise<TwitchStream[]> {
  const [ruStreams, allStreams] = await Promise.all([
    fetchStreams(gameId, { language: 'ru' }),
    fetchStreams(gameId, {}),
  ]);

  const ruIds = new Set(ruStreams.map((s) => s.id));
  const additional = allStreams.filter((s) => !ruIds.has(s.id) && isRussianByContent(s));

  return [...ruStreams, ...additional];
}
