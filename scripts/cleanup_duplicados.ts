import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    console.log('🧹 Limpiando archivos de video duplicados...');
    const videos = await prisma.videoFile.findMany();
    const seenPaths = new Set();
    const toDelete = [];
    
    // Priorizamos mantener los COMPLETED
    videos.sort((a, b) => {
       if (a.status === 'COMPLETED' && b.status !== 'COMPLETED') return -1;
       if (b.status === 'COMPLETED' && a.status !== 'COMPLETED') return 1;
       return 0;
    });

    for (const v of videos) {
        if (!v.originalPath) continue;
        if (seenPaths.has(v.originalPath)) {
            toDelete.push(v.id);
        } else {
            seenPaths.add(v.originalPath);
        }
    }
    
    if (toDelete.length > 0) {
        const res = await prisma.videoFile.deleteMany({ where: { id: { in: toDelete } } });
        console.log(`✅ Se eliminaron ${res.count} videos clonados (mismo archivo subido varias veces).`);
    } else {
        console.log('✅ No se encontraron videos clonados.');
    }
}
run().then(() => process.exit(0));
