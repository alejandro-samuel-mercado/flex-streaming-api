const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const { env } = require('./dist/shared/config/env.js');
const { execSync } = require('child_process');

async function main() {
  const connection = new IORedis(env.REDIS_URL);
  const queue = new Queue('video_processing_MOVIES', { connection });
  
  const waiting = await queue.getWaitingCount();
  const active = await queue.getActiveCount();
  const delayed = await queue.getDelayedCount();
  const failed = await queue.getFailedCount();
  
  console.log(`\n=== ESTADO REAL DE BULLMQ ===`);
  console.log(`En espera (Waiting): ${waiting}`);
  console.log(`Procesando (Active): ${active}`);
  console.log(`Fallidos (Failed): ${failed}`);
  
  const activeJobs = await queue.getActive();
  if (activeJobs.length > 0) {
    console.log(`\n=== TRABAJO ACTUAL ===`);
    console.log(`Job ID: ${activeJobs[0].id}`);
    console.log(`Archivo: ${activeJobs[0].data.videoPath}`);
  }

  console.log(`\n=== PROCESOS DE FFMPEG EN EL SISTEMA ===`);
  try {
    const ffmpegProcs = execSync('ps aux | grep ffmpeg | grep -v grep').toString();
    console.log(ffmpegProcs);
  } catch (e) {
    console.log('No hay ningún proceso de ffmpeg corriendo en este momento.');
  }

  process.exit(0);
}

main().catch(console.error);
