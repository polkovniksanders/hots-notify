import { getPrisma } from './client';

export const PROFILE_FIELDS = ['description', 'discord', 'telegram', 'youtube', 'donate'] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

export interface StreamerProfile {
  userLogin: string;
  description: string | null;
  discord: string | null;
  telegram: string | null;
  youtube: string | null;
  donate: string | null;
}

// URL-поля: обязаны содержать валидный https/http URL
const URL_FIELDS: ProfileField[] = ['discord', 'telegram', 'youtube', 'donate'];

export function isProfileField(value: string): value is ProfileField {
  return (PROFILE_FIELDS as readonly string[]).includes(value);
}

export function isUrlField(field: ProfileField): boolean {
  return URL_FIELDS.includes(field);
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function getProfile(userLogin: string): Promise<StreamerProfile | null> {
  return getPrisma().streamerProfile.findUnique({
    where: { userLogin: userLogin.toLowerCase() },
  });
}

export async function setProfileField(
  userLogin: string,
  field: ProfileField,
  value: string,
): Promise<StreamerProfile> {
  const login = userLogin.toLowerCase();
  return getPrisma().streamerProfile.upsert({
    where: { userLogin: login },
    create: { userLogin: login, [field]: value },
    update: { [field]: value },
  });
}

export async function clearProfileField(
  userLogin: string,
  field: ProfileField,
): Promise<StreamerProfile> {
  const login = userLogin.toLowerCase();
  return getPrisma().streamerProfile.upsert({
    where: { userLogin: login },
    create: { userLogin: login },
    update: { [field]: null },
  });
}

export async function deleteProfile(userLogin: string): Promise<boolean> {
  const result = await getPrisma().streamerProfile.deleteMany({
    where: { userLogin: userLogin.toLowerCase() },
  });
  return result.count > 0;
}
