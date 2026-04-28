"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoQueueEvents = exports.videoQueue = void 0;
exports.addVideoJob = addVideoJob;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("../shared/config/env");
// Connection to Redis via ioredis is required by BullMQ
const connection = new ioredis_1.default(env_1.env.REDIS_URL, {
    maxRetriesPerRequest: null,
});
exports.videoQueue = new bullmq_1.Queue('video-processing', { connection });
exports.videoQueueEvents = new bullmq_1.QueueEvents('video-processing', { connection });
async function addVideoJob(jobData) {
    return await exports.videoQueue.add('process-video', jobData, {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000, // wait 5s, then 10s, then 20s...
        },
        removeOnComplete: true,
    });
}
//# sourceMappingURL=queue.service.js.map