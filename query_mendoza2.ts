import './src/shared/config/env';
import { prisma } from './src/shared/config/prisma';

async function main() {
    const vfs = await prisma.videoFile.findMany({
        where: { originalPath: { contains: 'mendoza', mode: 'insensitive' } },
        include: { content: true, episode: { include: { season: { include: { content: true } } } } }
    });
    console.log("BY VIDEO_FILE PATH:", JSON.stringify(vfs, null, 2));
}
main().finally(() => prisma.$disconnect());
