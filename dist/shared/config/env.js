"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    BACKEND_PORT: zod_1.z.coerce.number().default(4000),
    DATABASE_URL: zod_1.z.string(),
    REDIS_URL: zod_1.z.string(),
    JWT_ACCESS_SECRET: zod_1.z.string().min(32),
    JWT_REFRESH_SECRET: zod_1.z.string().min(32),
    JWT_ACCESS_EXPIRES_IN: zod_1.z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: zod_1.z.string().default('30d'),
    GOOGLE_CLIENT_ID: zod_1.z.string().optional(),
    GOOGLE_CLIENT_SECRET: zod_1.z.string().optional(),
    SMTP_HOST: zod_1.z.string().optional(),
    SMTP_PORT: zod_1.z.coerce.number().optional(),
    SMTP_USER: zod_1.z.string().optional(),
    SMTP_PASS: zod_1.z.string().optional(),
    SMTP_FROM: zod_1.z.string().optional(),
    TMDB_API_KEY: zod_1.z.string().optional(),
    TMDB_ACCESS_TOKEN: zod_1.z.string().optional(),
    TMDB_BASE_URL: zod_1.z.string().default('https://api.themoviedb.org/3'),
    UPLOAD_DIR: zod_1.z.string().default('./uploads'),
    MAX_FILE_SIZE_MB: zod_1.z.coerce.number().default(2048),
    FRONTEND_URL: zod_1.z.string().default('http://localhost:3000'),
    BACKEND_URL: zod_1.z.string().default('http://localhost:4000'),
    // Streaming & Media (PROMPT MAESTRO)
    STREAM_SECRET: zod_1.z.string().min(32).default('default_stream_secret_change_in_production_64chars'),
    MEDIA_PATH: zod_1.z.string().default('./media'),
    UPLOADS_PATH: zod_1.z.string().default('./media/uploads'),
    HLS_PATH: zod_1.z.string().default('./media/hls'),
    THUMBNAILS_PATH: zod_1.z.string().default('./media/thumbnails'),
    SUBTITLES_PATH: zod_1.z.string().default('./media/subtitles'),
    FFMPEG_PATH: zod_1.z.string().default('ffmpeg'),
    FFPROBE_PATH: zod_1.z.string().default('ffprobe'),
    MAX_CONCURRENT_ENCODING: zod_1.z.coerce.number().default(2),
    // Media Scanner
    MEDIA_SCAN_DIRS: zod_1.z.string().optional().default(''),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
    process.exit(1);
}
exports.env = parsed.data;
//# sourceMappingURL=env.js.map