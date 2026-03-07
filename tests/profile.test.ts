import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockStreamerProfile = {
  findUnique: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
};

vi.mock('../src/db/client', () => ({
  getPrisma: () => ({ streamerProfile: mockStreamerProfile }),
}));

import {
  isProfileField,
  isUrlField,
  isValidHttpUrl,
  getProfile,
  setProfileField,
  clearProfileField,
  deleteProfile,
  setThumbnailPath,
  clearThumbnailPath,
  PROFILE_FIELDS,
} from '../src/db/profile';

// ---------------------------------------------------------------------------
// isProfileField
// ---------------------------------------------------------------------------

describe('isProfileField', () => {
  it('returns true for every field in PROFILE_FIELDS', () => {
    for (const field of PROFILE_FIELDS) {
      expect(isProfileField(field)).toBe(true);
    }
  });

  it('returns false for unknown field', () => {
    expect(isProfileField('unknown')).toBe(false);
  });

  it('returns false for thumbnailPath (managed separately, not in PROFILE_FIELDS)', () => {
    expect(isProfileField('thumbnailPath')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isProfileField('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isUrlField
// ---------------------------------------------------------------------------

describe('isUrlField', () => {
  it('requires URL for discord', () => {
    expect(isUrlField('discord')).toBe(true);
  });

  it('requires URL for telegram', () => {
    expect(isUrlField('telegram')).toBe(true);
  });

  it('requires URL for youtube', () => {
    expect(isUrlField('youtube')).toBe(true);
  });

  it('requires URL for donate', () => {
    expect(isUrlField('donate')).toBe(true);
  });

  it('does not require URL for description', () => {
    expect(isUrlField('description')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidHttpUrl
// ---------------------------------------------------------------------------

describe('isValidHttpUrl', () => {
  it('accepts https URL', () => {
    expect(isValidHttpUrl('https://discord.gg/abc123')).toBe(true);
  });

  it('accepts http URL', () => {
    expect(isValidHttpUrl('http://example.com')).toBe(true);
  });

  it('rejects plain text', () => {
    expect(isValidHttpUrl('not a url')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidHttpUrl('')).toBe(false);
  });

  it('rejects ftp:// protocol', () => {
    expect(isValidHttpUrl('ftp://files.example.com')).toBe(false);
  });

  it('rejects URL without protocol', () => {
    expect(isValidHttpUrl('discord.gg/abc')).toBe(false);
  });

  it('accepts URL with path and query string', () => {
    expect(isValidHttpUrl('https://youtube.com/@channel?sub=1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getProfile
// ---------------------------------------------------------------------------

describe('getProfile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls findUnique with lowercased login', async () => {
    mockStreamerProfile.findUnique.mockResolvedValue(null);

    await getProfile('ZloyEugene');

    expect(mockStreamerProfile.findUnique).toHaveBeenCalledWith({
      where: { userLogin: 'zloyeugene' },
    });
  });

  it('returns null when profile does not exist', async () => {
    mockStreamerProfile.findUnique.mockResolvedValue(null);

    const result = await getProfile('nobody');

    expect(result).toBeNull();
  });

  it('returns the profile when found', async () => {
    const profile = { userLogin: 'zloyeugene', description: 'cool', discord: null, telegram: null, youtube: null, donate: null, thumbnailPath: null };
    mockStreamerProfile.findUnique.mockResolvedValue(profile);

    const result = await getProfile('zloyeugene');

    expect(result).toEqual(profile);
  });
});

// ---------------------------------------------------------------------------
// setProfileField
// ---------------------------------------------------------------------------

describe('setProfileField', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lowercases the login before upsert', async () => {
    mockStreamerProfile.upsert.mockResolvedValue({});

    await setProfileField('ZloyEugene', 'description', 'Top player');

    const call = mockStreamerProfile.upsert.mock.calls[0][0];
    expect(call.where.userLogin).toBe('zloyeugene');
    expect(call.create.userLogin).toBe('zloyeugene');
  });

  it('sets the field in both create and update', async () => {
    mockStreamerProfile.upsert.mockResolvedValue({});

    await setProfileField('streamer', 'discord', 'https://discord.gg/abc');

    const call = mockStreamerProfile.upsert.mock.calls[0][0];
    expect(call.create.discord).toBe('https://discord.gg/abc');
    expect(call.update.discord).toBe('https://discord.gg/abc');
  });
});

// ---------------------------------------------------------------------------
// clearProfileField
// ---------------------------------------------------------------------------

describe('clearProfileField', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets the field to null in the update', async () => {
    mockStreamerProfile.upsert.mockResolvedValue({});

    await clearProfileField('streamer', 'discord');

    const call = mockStreamerProfile.upsert.mock.calls[0][0];
    expect(call.update.discord).toBeNull();
  });

  it('lowercases the login', async () => {
    mockStreamerProfile.upsert.mockResolvedValue({});

    await clearProfileField('STREAMER', 'youtube');

    const call = mockStreamerProfile.upsert.mock.calls[0][0];
    expect(call.where.userLogin).toBe('streamer');
  });
});

// ---------------------------------------------------------------------------
// deleteProfile
// ---------------------------------------------------------------------------

describe('deleteProfile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when a profile was deleted', async () => {
    mockStreamerProfile.deleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteProfile('zloyeugene');

    expect(result).toBe(true);
  });

  it('returns false when profile did not exist', async () => {
    mockStreamerProfile.deleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteProfile('nobody');

    expect(result).toBe(false);
  });

  it('lowercases the login', async () => {
    mockStreamerProfile.deleteMany.mockResolvedValue({ count: 0 });

    await deleteProfile('ZloyEUGENE');

    expect(mockStreamerProfile.deleteMany).toHaveBeenCalledWith({
      where: { userLogin: 'zloyeugene' },
    });
  });
});

// ---------------------------------------------------------------------------
// setThumbnailPath
// ---------------------------------------------------------------------------

describe('setThumbnailPath', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts thumbnailPath with lowercased login', async () => {
    mockStreamerProfile.upsert.mockResolvedValue({});

    await setThumbnailPath('ZloyEugene', '/data/thumbnails/zloyeugene.jpg');

    const call = mockStreamerProfile.upsert.mock.calls[0][0];
    expect(call.where.userLogin).toBe('zloyeugene');
    expect(call.create.thumbnailPath).toBe('/data/thumbnails/zloyeugene.jpg');
    expect(call.update.thumbnailPath).toBe('/data/thumbnails/zloyeugene.jpg');
  });

  it('creates a new profile row when none exists (upsert create path)', async () => {
    mockStreamerProfile.upsert.mockResolvedValue({});

    await setThumbnailPath('newstreamer', '/path/to/thumb.jpg');

    const call = mockStreamerProfile.upsert.mock.calls[0][0];
    expect(call.create.userLogin).toBe('newstreamer');
    expect(call.create.thumbnailPath).toBe('/path/to/thumb.jpg');
  });
});

// ---------------------------------------------------------------------------
// clearThumbnailPath
// ---------------------------------------------------------------------------

describe('clearThumbnailPath', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets thumbnailPath to null', async () => {
    mockStreamerProfile.upsert.mockResolvedValue({});

    await clearThumbnailPath('zloyeugene');

    const call = mockStreamerProfile.upsert.mock.calls[0][0];
    expect(call.update.thumbnailPath).toBeNull();
  });

  it('lowercases the login', async () => {
    mockStreamerProfile.upsert.mockResolvedValue({});

    await clearThumbnailPath('STREAMER');

    const call = mockStreamerProfile.upsert.mock.calls[0][0];
    expect(call.where.userLogin).toBe('streamer');
  });
});
