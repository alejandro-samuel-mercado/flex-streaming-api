import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    BACKEND_PORT: z.coerce.number().default(4000),
    DATABASE_URL: z.string(),
    REDIS_URL: z.string(),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    TMDB_API_KEY: z.string().optional(),
    TMDB_ACCESS_TOKEN: z.string().optional(),
    TMDB_BASE_URL: z.string().default('https://api.themoviedb.org/3'),
    UPLOAD_DIR: z.string().default('./uploads'),
    MAX_FILE_SIZE_MB: z.coerce.number().default(2048),
    FRONTEND_URL: z.string().default('http://localhost:3000'),
    BACKEND_URL: z.string().default('http://localhost:4000'),

    // Streaming & Media (PROMPT MAESTRO)
    STREAM_SECRET: z.string().min(32).default('default_stream_secret_change_in_production_64chars'),
    MEDIA_PATH: z.string().default('./media'),
    UPLOADS_PATH: z.string().default('./media/uploads'),
    HLS_PATH: z.string().default('./media/hls'),
    THUMBNAILS_PATH: z.string().default('./media/thumbnails'),
    SUBTITLES_PATH: z.string().default('./media/subtitles'),
    FFMPEG_PATH: z.string().default('ffmpeg'),
    FFPROBE_PATH: z.string().default('ffprobe'),
    MAX_CONCURRENT_ENCODING: z.coerce.number().default(1),

    // Media Scanner
    MEDIA_SCAN_DIRS: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
    process.exit(1);
}

export const env = parsed.data;
