import { MediaScannerService } from './src/modules/media-scanner/media-scanner.service';

async function main() {
    const targetDir = '/home/media/series/69601_El chema';
    console.log(`🔍 Escaneando directamente la carpeta: ${targetDir}`);
    
    try {
        const files = await MediaScannerService.scanDirectory(targetDir, 6, 'SERIES');
        console.log(`\n✅ El escáner encontró ${files.length} archivos dentro de esta carpeta.`);
        
        if (files.length > 0) {
            console.log("Ejemplo del primer archivo:");
            console.log("- Ruta:", files[0].filePath);
            console.log("- Ya Importado (en BD)?", files[0].alreadyImported);
            
            // Check mtime age
            const fs = require('fs');
            const stat = fs.statSync(files[0].filePath);
            const ageMins = (Date.now() - stat.mtimeMs) / (60 * 1000);
            console.log(`- Edad del archivo: hace ${ageMins.toFixed(1)} minutos`);
            if (ageMins < 15) {
                console.log("⚠️ ATENCIÓN: El archivo es DEMASIADO NUEVO (< 15 mins). El escáner de producción lo saltará automáticamente creyendo que aún se está subiendo.");
            }
        }
    } catch (err) {
        console.error("❌ Error escaneando:", err);
    }
}

main().catch(console.error).finally(() => process.exit(0));
