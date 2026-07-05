import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const v = await prisma.videoFile.findUnique({ where: { id: 'cmr6zvej0023kr0xb3o017zuv' }});
  console.log('Video:', v);
}
run();
