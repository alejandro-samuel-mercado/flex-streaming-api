"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoQueueEvents = exports.videoQueue = void 0;
exports.addVideoJob = addVideoJob;
exports.removeVideoJob = removeVideoJob;
exports.getJobLogs = getJobLogs;
exports.isProcessingAllowed = isProcessingAllowed;
exports.startQueueScheduler = startQueueScheduler;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("../shared/config/env");
// Connection to Redis via ioredis is required by BullMQ
const connection = new ioredis_1.default(env_1.env.REDIS_URL, {
    maxRetriesPerRequest: null,
});
exports.videoQueue = new bullmq_1.Queue('video-processing', { connection: connection });
exports.videoQueueEvents = new bullmq_1.QueueEvents('video-processing', { connection: connection });
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
async function removeVideoJob(jobId) {
    try {
        const job = await exports.videoQueue.getJob(jobId);
        if (job) {
            await job.remove();
            return true;
        }
    }
    catch (err) {
        console.warn(`⚠️ [Queue] Could not remove locked job ${jobId}: ${err.message}`);
        // If it's locked, it's already processing. 
        // The worker will fail when it tries to update the (now deleted) DB record.
    }
    return false;
}
async function getJobLogs(jobId) {
    try {
        const job = await exports.videoQueue.getJob(jobId);
        if (!job)
            return { logs: [], count: 0 };
        return await exports.videoQueue.getJobLogs(jobId);
    }
    catch (err) {
        console.warn(`⚠️ [Queue] Could not get logs for job ${jobId}: ${err.message}`);
        return { logs: [], count: 0 };
    }
}
/**
 * Deterministic schedule logic:
 * - Always active between 3:00 AM and 6:59 AM (3 AM to 7 AM uninterrupted block).
 * - Otherwise, follows a 6-hour cycle: 2 hours active, 4 hours rest (anchored at 00:00).
 */
function isProcessingAllowed() {
    // Process jobs immediately at all times. 
    // The previous 6-hour cycle logic has been removed to prevent jobs from getting stuck in QUEUED.
    return true;
}
let lastLoggedState = null;
function startQueueScheduler() {
    // Check every 30 seconds
    const timer = setInterval(async () => {
        try {
            const allowed = isProcessingAllowed();
            const isPaused = await exports.videoQueue.isPaused();
            if (allowed && isPaused) {
                await exports.videoQueue.resume();
                if (lastLoggedState !== true) {
                    console.log("⏰ [Queue Scheduler] Resuming video queue (Active window: 2h cycle / Night block)");
                    lastLoggedState = true;
                }
            }
            else if (!allowed && !isPaused) {
                await exports.videoQueue.pause();
                if (lastLoggedState !== false) {
                    console.log("⏰ [Queue Scheduler] Pausing video queue (Rest window: 4h pause)");
                    lastLoggedState = false;
                }
            }
        }
        catch (err) {
            console.error(`⏰ [Queue Scheduler] Error updating queue status: ${err.message}`);
        }
    }, 30000);
    // Prevent this background interval from blocking short-lived CLI scripts from exiting
    if (timer && typeof timer.unref === 'function') {
        timer.unref();
    }
}
// Start queue scheduler on startup
startQueueScheduler();
//# sourceMappingURL=queue.service.js.map