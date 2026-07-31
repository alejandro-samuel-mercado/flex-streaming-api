import { prisma } from './src/shared/config/prisma';

async function main() {
    const f = await prisma.videoFile.findFirst({
        where: { originalPath: { contains: 'Rocky', mode: 'insensitive' } },
        include: { content: { include: { translations: true } } }
    });
    console.log(JSON.stringify(f?.content, null, 2));
}
main().catch(console.error).finally(() => process.exit(0));
