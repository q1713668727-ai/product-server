import { basename } from 'node:path';

const DEFAULT_MARKET_ASSET_ORIGIN = 'http://39.104.19.197:3001';
const MARKET_ASSET_ORIGIN = String(process.env.MARKET_ASSET_ORIGIN || DEFAULT_MARKET_ASSET_ORIGIN)
  .trim()
  .replace(/\/+$/, '');

const stripQueryAndHash = (value: string) => value.split('#')[0].split('?')[0];

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const extractByUploadPrefix = (raw: string, folder: string) => {
  const escapedFolder = folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = raw.match(new RegExp(`/uploads/${escapedFolder}/([^/?#]+)`, 'i'));
  if (!match?.[1]) return '';
  return safeDecode(match[1]);
};

export const extractUploadFilename = (value: any, folder: string) => {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('blob:')) return '';
  const fromPrefix = extractByUploadPrefix(raw, folder);
  if (fromPrefix) return basename(fromPrefix);
  const tail = basename(stripQueryAndHash(raw));
  return tail ? safeDecode(tail) : '';
};

export const toStoredUploadValue = (value: any, folder: string) => {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('blob:')) return '';
  const filename = extractUploadFilename(raw, folder);
  if (filename) return filename;
  if (/^https?:\/\//i.test(raw)) return raw;
  return '';
};

export const toUploadPublicUrl = (value: any, folder: string) => {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('blob:')) return '';
  if (/^https?:\/\//i.test(raw) && !extractByUploadPrefix(raw, folder)) return raw;
  const filename = extractUploadFilename(raw, folder);
  if (!filename) return '';
  const path = `/uploads/${folder}/${encodeURIComponent(filename)}`;
  return MARKET_ASSET_ORIGIN ? `${MARKET_ASSET_ORIGIN}${path}` : path;
};
