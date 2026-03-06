import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios');
vi.mock('../src/twitch/auth', () => ({
  getAccessToken: vi.fn().mockResolvedValue('test-token'),
}));
vi.mock('../src/config', () => ({
  config: { twitchClientId: 'test-client-id' },
}));

import axios from 'axios';
import { getTwitchUser } from '../src/twitch/users';

describe('getTwitchUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the user when found', async () => {
    const user = { id: '42', login: 'zloyeugene', display_name: 'ZloyEugene', broadcaster_type: 'affiliate' };
    vi.mocked(axios.get).mockResolvedValue({ data: { data: [user] } });

    const result = await getTwitchUser('zloyeugene');

    expect(result).toEqual(user);
  });

  it('returns null when Twitch returns an empty list', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { data: [] } });

    const result = await getTwitchUser('unknownuser');

    expect(result).toBeNull();
  });

  it('calls the correct Twitch endpoint', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { data: [] } });

    await getTwitchUser('testlogin');

    expect(axios.get).toHaveBeenCalledWith(
      'https://api.twitch.tv/helix/users',
      expect.objectContaining({ params: { login: 'testlogin' } }),
    );
  });

  it('passes the access token in the Authorization header', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { data: [] } });

    await getTwitchUser('testlogin');

    const [, options] = vi.mocked(axios.get).mock.calls[0];
    expect(options?.headers?.['Authorization']).toBe('Bearer test-token');
  });
});
