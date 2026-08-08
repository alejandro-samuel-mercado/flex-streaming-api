import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';
async function test() {
  const vfs = await prisma.videoFile.findMany({ where: { type: 'MOVIE' }, include: { content: true } });
  const counts: Record<string, number> = {};
  for(const v of vfs) {
    if(!v.content) continue;
    const t = (v.content.title || '').trim().toLowerCase();
    const y = v.content.releaseYear || 'unknown';
    const key = `${t}_${y}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  const dups = Object.entries(counts).filter(x => x[1] > 1);
  console.log("Top duplicate keys:", dups.sort((a,b) => b[1]-a[1]).slice(0, 10));
}
test().finally(() => process.exit(0));
