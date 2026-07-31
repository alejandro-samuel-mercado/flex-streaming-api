import fs from 'fs';
import { prisma } from './src/shared/config/prisma';
import { execSync } from 'child_process';

async function main() {
    console.log("🧟 Resucitando películas perdidas...");
    
    const keywords = ['Rocky', 'callejero', 'princesas'];
    const dbFiles = await prisma.videoFile.findMany({
        where: {
            OR: keywords.map(k => ({ originalPath: { contains: k, mode: 'insensitive' } }))
        }
    });

    for (const file of dbFiles) {
        console.log(`Borrando registro fantasma de: ${file.originalPath}`);
        await prisma.videoFile.delete({ where: { id: file.id } });
        if (file.contentId) {
            try {
                await prisma.content.delete({ where: { id: file.contentId } });
            } catch(e) {}
        }
    }

    const dir = '/home/peliplus_gran_disco/videos_subidos';
    const files = fs.readdirSync(dir).filter(f => 
        keywords.some(k => f.toLowerCase().includes(k.toLowerCase()))
    );

    for (const f of files) {
        const oldPath = `${dir}/${f}`;
        const newPath = `/home/media/peliculas/${f}`;
        console.log(`Moviendo de vuelta al escáner: ${f}`);
        fs.renameSync(oldPath, newPath);
    }

    console.log("\n✅ ¡Películas resucitadas y listas para escanear!");
}
main().catch(console.error).finally(() => process.exit(0));
