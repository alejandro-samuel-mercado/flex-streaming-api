import { prisma } from './src/shared/config/prisma';
async function main() {
    const p = await prisma.profile.findFirst();
    const c = await prisma.content.findFirst({ where: { type: 'MOVIE' } });
    const h = await prisma.watchHistory.findFirst({ where: { profileId: p.id, contentId: c.id } });
    console.log("History for movie:", c.title, "is:", h);
}
main();
