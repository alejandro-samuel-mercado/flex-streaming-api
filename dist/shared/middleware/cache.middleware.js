"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheMiddleware = cacheMiddleware;
exports.invalidateCache = invalidateCache;
const redis_1 = require("../config/redis");
const CACHE_TTL = {
    catalog: 5 * 60,
    contentDetail: 10 * 60,
    trending: 2 * 60,
    recommendations: 15 * 60,
    search: 2 * 60,
};
function cacheMiddleware(category) {
    return async (req, res, next) => {
        const key = `cache:${req.originalUrl}`;
        try {
            const cached = await redis_1.redis.get(key);
            if (cached) {
                res.setHeader('X-Cache', 'HIT');
                res.json(JSON.parse(cached));
                return;
            }
        }
        catch {
            // Redis down — continue without cache
        }
        const originalJson = res.json.bind(res);
        res.json = (data) => {
            const ttl = CACHE_TTL[category];
            redis_1.redis.setex(key, ttl, JSON.stringify(data)).catch(() => { });
            res.setHeader('X-Cache', 'MISS');
            return originalJson(data);
        };
        next();
    };
}
async function invalidateCache(pattern) {
    try {
        const keys = await redis_1.redis.keys(`cache:${pattern}`);
        if (keys.length > 0) {
            await redis_1.redis.del(...keys);
        }
    }
    catch {
        // Redis down — skip
    }
}
//# sourceMappingURL=cache.middleware.js.map