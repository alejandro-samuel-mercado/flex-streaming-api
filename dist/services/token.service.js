"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSignedUrl = generateSignedUrl;
exports.verifySignedToken = verifySignedToken;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../shared/config/env");
function generateSignedUrl(videoFileId, ip, ttlSeconds) {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const data = `${videoFileId}:${ip}:${expires}`;
    const hmac = crypto_1.default
        .createHmac('sha256', env_1.env.STREAM_SECRET)
        .update(data)
        .digest('hex');
    return `${hmac}.${expires}`;
}
function verifySignedToken(token, videoFileId, ip) {
    const parts = token.split('.');
    if (parts.length !== 2)
        return false;
    const [hmac, expiresStr] = parts;
    const expires = parseInt(expiresStr, 10);
    if (isNaN(expires) || Date.now() / 1000 > expires)
        return false;
    const expected = crypto_1.default
        .createHmac('sha256', env_1.env.STREAM_SECRET)
        .update(`${videoFileId}:${ip}:${expires}`)
        .digest('hex');
    return crypto_1.default.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'));
}
//# sourceMappingURL=token.service.js.map