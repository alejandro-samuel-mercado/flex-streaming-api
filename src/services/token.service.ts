import crypto from 'crypto';
import { env } from '../shared/config/env';

export function generateSignedUrl(
  videoFileId: string,
  ip: string,
  ttlSeconds: number
): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const data = `${videoFileId}:${ip}:${expires}`;
  const hmac = crypto
    .createHmac('sha256', env.STREAM_SECRET)
    .update(data)
    .digest('hex');

  return `${hmac}.${expires}`;
}

export function verifySignedToken(
  token: string,
  videoFileId: string,
  ip: string
): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [hmac, expiresStr] = parts;
  const expires = parseInt(expiresStr, 10);

  if (isNaN(expires) || Date.now() / 1000 > expires) return false;

  const expected = crypto
    .createHmac('sha256', env.STREAM_SECRET)
    .update(`${videoFileId}:${ip}:${expires}`)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(hmac, 'hex'),
    Buffer.from(expected, 'hex')
  );
}
