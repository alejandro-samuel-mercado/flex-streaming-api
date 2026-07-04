require('dotenv').config();
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

async function main() {
  const connection = new IORedis(process.env.REDIS_URL);
  const queue = new Queue('video_processing_MOVIES', { connection });
  
  const waiting = await queue.getWaitingCount();
  const active = await queue.getActiveCount();
  const delayed = await queue.getDelayedCount();
  const failed = await queue.getFailedCount();
  const completed = await queue.getCompletedCount();

  console.log(`📊 BullMQ Queue Status (MOVIES):
  - Waiting: ${waiting}
  - Active: ${active}
  - Delayed: ${delayed}
  - Failed: ${failed}
  - Completed: ${completed}`);

  process.exit(0);
}

main().catch(console.error);
