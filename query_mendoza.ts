import './src/shared/config/env';
import { prisma } from './src/shared/config/prisma';

async function main() {
    const contents = await prisma.content.findMany({
        where: { slug: { contains: 'mendoza' } },
        include: { translations: true, videoFiles: true }
    });
    console.log("BY SLUG:", JSON.stringify(contents, null, 2));

    const vfs = await prisma.videoFile.findMany({
        where: { originalPath: { contains: 'mendoza', mode: 'insensitive' } },
        include: { content: true, episode: { include: { season: { include: { content: true } } } } }
    });
    console.log("BY VIDEO_FILE PATH:", JSON.stringify(vfs, null, 2));
}
main().finally(() => prisma.$disconnect());
