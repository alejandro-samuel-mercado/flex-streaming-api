import { Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../shared/config/env';

// Connection to Redis via ioredis is required by BullMQ
const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
});

export const videoQueue = new Queue('video-processing', { connection: connection as any });
export const videoQueueEvents = new QueueEvents('video-processing', { connection: connection as any });

export async function addVideoJob(jobData: {
    videoFileId: string;
    contentId: string;
    type?: string;
    seasonId?: string;
    episodeId?: string;
    videoPath: string;
}) {
    return await videoQueue.add('process-video', jobData, {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000, // wait 5s, then 10s, then 20s...
        },
        removeOnComplete: true,
    });
}

export async function removeVideoJob(jobId: string) {
    try {
        const job = await videoQueue.getJob(jobId);
        if (job) {
            await job.remove();
            return true;
        }
    } catch (err: any) {
        console.warn(`⚠️ [Queue] Could not remove locked job ${jobId}: ${err.message}`);
        // If it's locked, it's already processing. 
        // The worker will fail when it tries to update the (now deleted) DB record.
    }
    return false;
}

export async function getJobLogs(jobId: string) {
    try {
        const job = await videoQueue.getJob(jobId);
        if (!job) return { logs: [], count: 0 };
        return await videoQueue.getJobLogs(jobId);
    } catch (err: any) {
        console.warn(`⚠️ [Queue] Could not get logs for job ${jobId}: ${err.message}`);
        return { logs: [], count: 0 };
    }
}

/**
 * Deterministic schedule logic:
 * - Always active between 3:00 AM and 6:59 AM (3 AM to 7 AM uninterrupted block).
 * - Otherwise, follows a 6-hour cycle: 2 hours active, 4 hours rest (anchored at 00:00).
 */
export function isProcessingAllowed(date: Date = new Date()): boolean {
    // Process jobs immediately at all times. 
    // The previous 6-hour cycle logic has been removed to prevent jobs from getting stuck in QUEUED.
    return true;
}

let lastLoggedState: boolean | null = null;

export function startQueueScheduler() {
    // Check every 30 seconds
    const timer = setInterval(async () => {
        try {
            const allowed = isProcessingAllowed();
            const isPaused = await videoQueue.isPaused();

            if (allowed && isPaused) {
                await videoQueue.resume();
                if (lastLoggedState !== true) {
                    console.log("⏰ [Queue Scheduler] Resuming video queue (Active window: 2h cycle / Night block)");
                    lastLoggedState = true;
                }
            } else if (!allowed && !isPaused) {
                await videoQueue.pause();
                if (lastLoggedState !== false) {
                    console.log("⏰ [Queue Scheduler] Pausing video queue (Rest window: 4h pause)");
                    lastLoggedState = false;
                }
            }
        } catch (err: any) {
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

