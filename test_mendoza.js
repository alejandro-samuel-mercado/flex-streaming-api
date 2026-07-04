const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
    const res = await prisma.content.findMany({
        where: {
            OR: [
                { translations: { some: { title: { contains: 'Mendoza', mode: 'insensitive' } } } },
                { slug: { contains: 'mendoza', mode: 'insensitive' } },
                { originalTitle: { contains: 'Mendoza', mode: 'insensitive' } }
            ]
        },
        include: {
            translations: true,
            videoFiles: true,
        }
    });
    console.log(JSON.stringify(res, null, 2));
}
run().finally(() => prisma.$disconnect());
