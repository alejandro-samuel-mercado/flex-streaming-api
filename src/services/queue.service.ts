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
  contentId: string;
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
