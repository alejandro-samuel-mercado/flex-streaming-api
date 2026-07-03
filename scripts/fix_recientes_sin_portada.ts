import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Cargar variables de entorno desde el archivo .env
dotenv.config();

const prisma = new PrismaClient();

async function run() {
    console.log('🔍 Buscando contenidos recientes (últimas 6 horas) que están ACTIVOS o LISTOS pero NO tienen portada...');
    
    const timeLimit = new Date();
    timeLimit.setHours(timeLimit.getHours() - 6);

    try {
        const contents = await prisma.content.findMany({
            where: {
                createdAt: { gte: timeLimit },
                status: { in: ['ACTIVE', 'READY'] },
                thumbnails: { none: {} } // No tiene portadas
            },
            include: { translations: true }
        });

        if (contents.length === 0) {
            console.log('✅ No se encontraron contenidos con este problema.');
            process.exit(0);
        }

        console.log(`⚠️ Se encontraron ${contents.length} contenidos publicados por error sin metadata. Revirtiendo a PENDIENTE...`);

        let arreglados = 0;
        for (const c of contents) {
            const title = c.translations[0]?.title || c.slug;
            console.log(`   - Revirtiendo: "${title}" (ID: ${c.id})`);
            
            await prisma.content.update({
                where: { id: c.id },
                data: { status: 'PENDING' }
            });
            arreglados++;
        }

        console.log(`\n🎉 Listo! ${arreglados} contenidos fueron devueltos al estado PENDIENTE.`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Error ejecutando el script:', err);
        process.exit(1);
    }
}

run();
