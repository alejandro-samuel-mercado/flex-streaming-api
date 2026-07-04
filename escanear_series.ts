import { MediaScannerService } from './src/modules/media-scanner/media-scanner.service';
import { env } from './src/shared/config/env';

async function run() {
    console.log('🔍 Iniciando Escaneo de SERIES Manual...');
    try {
        // Escaneamos las series usando el directorio configurado en MEDIA_SCAN_DIRS o la ruta estática
        const seriesPath = process.env.MEDIA_SCAN_DIRS || '/home/series';
        console.log(`Buscando en directorio: ${seriesPath}`);

        // scanDirectories(moviePath, seriesPath) -> pasamos undefined a moviePath
        const files = await MediaScannerService.scanDirectories(undefined, seriesPath);
        console.log(`[MediaScanner] Escaneo completo: ${files.length} archivos/carpetas de series encontrados.`);

        // Importar secuencialmente para no sobrecargar la API de TMDB (Evita Error 429 Too Many Requests)
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            if (!f.alreadyImported) {
                if (f.extension === 'VACÍA') {
                    console.log(`⚠️  Registrando carpeta vacía como Fallida: ${f.fileName} (Faltan videos)`);
                    await MediaScannerService.importFile(f.filePath, 'SERIES', f.episode);
                } else {
                    console.log(`⏳ [${i + 1}/${files.length}] Encolando Serie/Episodio: ${f.fileName}...`);
                    await MediaScannerService.importFile(f.filePath, 'SERIES', f.episode);
                    // Pausa de 200ms entre llamadas para no saturar a TMDB
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
        }

        console.log('✅ ¡Escaneo de Series Finalizado!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error fatal en el escáner de series:', err);
        process.exit(1);
    }
}

run();
