import axios from 'axios';
import { config } from '../config';
import { getAccessToken } from './auth';

export interface TwitchClip {
  id: string;
  url: string;
  broadcaster_name: string;
  title: string;
  view_count: number;
  created_at: string;
}

export async function fetchTopClipsToday(gameId: string, limit = 5): Promise<TwitchClip[]> {
  const token = await getAccessToken();

  // Начало суток UTC
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const response = await axios.get('https://api.twitch.tv/helix/clips', {
    headers: {
      'Client-ID': config.twitchClientId,
      Authorization: `Bearer ${token}`,
    },
    params: {
      game_id: gameId,
      started_at: startOfDay.toISOString(),
      first: limit,
    },
  });

  return response.data.data as TwitchClip[];
}
