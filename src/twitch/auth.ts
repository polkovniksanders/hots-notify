import axios from 'axios';
import { config } from '../config';

let accessToken: string | null = null;
let tokenExpiry = 0;

export async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
    params: {
      client_id: config.twitchClientId,
      client_secret: config.twitchClientSecret,
      grant_type: 'client_credentials',
    },
  });

  accessToken = response.data.access_token as string;
  // Обновляем за минуту до истечения
  tokenExpiry = Date.now() + (response.data.expires_in as number) * 1000 - 60_000;

  return accessToken;
}
