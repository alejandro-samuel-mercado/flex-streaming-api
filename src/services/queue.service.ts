import { Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../shared/config/env';

// Connection to Redis via ioredis is required by BullMQ
const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const videoQueue = new Queue('video-processing', { connection });
export const videoQueueEvents = new QueueEvents('video-processing', { connection });

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
