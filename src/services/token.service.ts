import crypto from 'crypto';
import { env } from '../shared/config/env';

export function generateSignedUrl(
  videoFileId: string,
  _ip: string, // kept for API compatibility but not used in signature
  ttlSeconds: number
): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  // IP is intentionally excluded from the HMAC — IP-bound tokens break on mobile networks,
  // NAT, CGN, and any reverse proxy (Cloudflare, Nginx). Security is maintained by the
  // unforgeable HMAC signature and the expiry time alone.
  const data = `${videoFileId}:${expires}`;
  const hmac = crypto
    .createHmac('sha256', env.STREAM_SECRET)
    .update(data)
    .digest('hex');

  return `${hmac}.${expires}`;
}

export function verifySignedToken(
  token: string,
  videoFileId: string,
  _ip: string // kept for API compatibility
): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [hmac, expiresStr] = parts;
  const expires = parseInt(expiresStr, 10);

  if (isNaN(expires) || Date.now() / 1000 > expires) return false;

  const expected = crypto
    .createHmac('sha256', env.STREAM_SECRET)
    .update(`${videoFileId}:${expires}`)
    .digest('hex');

  // Use timingSafeEqual to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmac, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    // If buffers are different lengths (malformed token), timingSafeEqual throws
    return false;
  }
}
