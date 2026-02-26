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
}

export async function fetchRussianStreams(gameId: string): Promise<TwitchStream[]> {
  const token = await getAccessToken();

  const response = await axios.get('https://api.twitch.tv/helix/streams', {
    headers: {
      'Client-ID': config.twitchClientId,
      Authorization: `Bearer ${token}`,
    },
    params: {
      game_id: gameId,
      language: 'ru',
      first: 100,
    },
  });

  return response.data.data as TwitchStream[];
}
