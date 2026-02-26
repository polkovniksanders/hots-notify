import axios from 'axios';
import { config } from '../config';
import { getAccessToken } from './auth';

export async function getGameIdByName(name: string): Promise<string> {
  const token = await getAccessToken();

  const response = await axios.get('https://api.twitch.tv/helix/games', {
    headers: {
      'Client-ID': config.twitchClientId,
      Authorization: `Bearer ${token}`,
    },
    params: { name },
  });

  const games = response.data.data as Array<{ id: string; name: string }>;
  if (!games.length) throw new Error(`Game not found on Twitch: "${name}"`);

  return games[0].id;
}
