import "dotenv/config";
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const vfs = await prisma.videoFile.groupBy({
        by: ['sourceNode'],
        _count: { id: true }
    });
    console.log(vfs);
}
main().finally(() => prisma.$disconnect());
