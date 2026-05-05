"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSignedUrl = generateSignedUrl;
exports.verifySignedToken = verifySignedToken;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../shared/config/env");
function generateSignedUrl(videoFileId, _ip, // kept for API compatibility but not used in signature
ttlSeconds) {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    // IP is intentionally excluded from the HMAC — IP-bound tokens break on mobile networks,
    // NAT, CGN, and any reverse proxy (Cloudflare, Nginx). Security is maintained by the
    // unforgeable HMAC signature and the expiry time alone.
    const data = `${videoFileId}:${expires}`;
    const hmac = crypto_1.default
        .createHmac('sha256', env_1.env.STREAM_SECRET)
        .update(data)
        .digest('hex');
    return `${hmac}.${expires}`;
}
function verifySignedToken(token, videoFileId, _ip // kept for API compatibility
) {
    const parts = token.split('.');
    if (parts.length !== 2)
        return false;
    const [hmac, expiresStr] = parts;
    const expires = parseInt(expiresStr, 10);
    if (isNaN(expires) || Date.now() / 1000 > expires)
        return false;
    const expected = crypto_1.default
        .createHmac('sha256', env_1.env.STREAM_SECRET)
        .update(`${videoFileId}:${expires}`)
        .digest('hex');
    // Use timingSafeEqual to prevent timing attacks
    try {
        return crypto_1.default.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'));
    }
    catch {
        // If buffers are different lengths (malformed token), timingSafeEqual throws
        return false;
    }
}
//# sourceMappingURL=token.service.js.map