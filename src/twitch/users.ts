import axios from 'axios';
import { config } from '../config';
import { getAccessToken } from './auth';

export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  broadcaster_type: 'affiliate' | 'partner' | '';
}

export async function getTwitchUser(login: string): Promise<TwitchUser | null> {
  const token = await getAccessToken();
  const response = await axios.get('https://api.twitch.tv/helix/users', {
    headers: {
      'Client-ID': config.twitchClientId,
      Authorization: `Bearer ${token}`,
    },
    params: { login },
  });
  const data = response.data.data as TwitchUser[];
  return data[0] ?? null;
}
