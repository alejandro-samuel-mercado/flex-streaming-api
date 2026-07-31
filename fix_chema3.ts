import { prisma } from './src/shared/config/prisma';
import fs from 'fs';
import { execSync } from 'child_process';

async function main() {
    console.log("🧹 FORZANDO LIMPIEZA DE CUALQUIER SERIE CHINA O EQUIVOCADA...");
    
    // 1. Borrar de la BD
    try {
        await prisma.$executeRawUnsafe(`DELETE FROM "video_files" WHERE "originalPath" LIKE '%chema%'`);
        await prisma.$executeRawUnsafe(`DELETE FROM "content" WHERE "tmdbId" IN ('69601', '68735')`);
        console.log("✅ Limpieza de BD completada.");
    } catch (e) {
        console.log("⚠️ Error limpiando BD (tal vez ya estaba limpia):", e);
    }
    
    // 2. Renombrar la carpeta por la fuerza
    try {
        execSync(`mv "/home/media/series/69601_El chema" "/home/media/series/69205_El chema" 2>/dev/null`);
        console.log("✅ Carpeta 69601 renombrada forzosamente a 69205.");
    } catch(e) {}
    try {
        execSync(`mv "/home/media/series/68735_El chema" "/home/media/series/69205_El chema" 2>/dev/null`);
        console.log("✅ Carpeta 68735 renombrada forzosamente a 69205.");
    } catch(e) {}
    try {
        execSync(`mv "/home/media/series/El chema" "/home/media/series/69205_El chema" 2>/dev/null`);
    } catch(e) {}

    const list = execSync(`ls -ld "/home/media/series/"*chema* 2>/dev/null || echo "No existe"`).toString();
    console.log("\n📁 ESTADO ACTUAL DE LAS CARPETAS EN EL DISCO:");
    console.log(list);
}
main().catch(console.error).finally(() => process.exit(0));
