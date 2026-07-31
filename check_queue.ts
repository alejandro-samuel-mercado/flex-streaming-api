import { prisma } from './src/shared/config/prisma';

async function main() {
    const files = await prisma.videoFile.findMany({
        where: { originalPath: { contains: '69601' } }
    });

    if (files.length === 0) {
        console.log("❌ No hay ningún video en cola para la carpeta 69601_El chema.");
    } else {
        console.log(`✅ ¡Encontré ${files.length} videos en la base de datos!`);
        console.log("Estado actual del primer video:", files[0].status);
        if (files[0].status === 'PENDING') {
            console.log("👉 Esto significa que el escáner SÍ los detectó, pero están haciendo fila (PENDING) en la cola de FFmpeg (BullMQ).");
            console.log("El servidor de series está procesando otros videos antes. El Chema aparecerá en el panel cuando empiece a procesarse.");
        } else if (files[0].status === 'FAILED') {
            console.log("⚠️ Hubo un error procesándolo. Error:", files[0].errorMessage);
        }
    }
}

main().catch(console.error).finally(() => process.exit(0));
