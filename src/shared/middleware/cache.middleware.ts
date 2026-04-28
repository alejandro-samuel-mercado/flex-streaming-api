import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';

const CACHE_TTL = {
  catalog: 5 * 60,
  contentDetail: 10 * 60,
  trending: 2 * 60,
  recommendations: 15 * 60,
  search: 2 * 60,
} as const;

export type CacheCategory = keyof typeof CACHE_TTL;

export function cacheMiddleware(category: CacheCategory) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `cache:${req.originalUrl}`;

    try {
      const cached = await redis.get(key);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.json(JSON.parse(cached));
        return;
      }
    } catch {
      // Redis down — continue without cache
    }

    const originalJson = res.json.bind(res);
    res.json = (data: unknown) => {
      const ttl = CACHE_TTL[category];
      redis.setex(key, ttl, JSON.stringify(data)).catch(() => {});
      res.setHeader('X-Cache', 'MISS');
      return originalJson(data);
    };

    next();
  };
}

export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(`cache:${pattern}`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Redis down — skip
  }
}
