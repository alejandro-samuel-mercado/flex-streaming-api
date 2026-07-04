import { MediaScannerService } from './src/modules/media-scanner/media-scanner.service';

async function run() {
    console.log('🔍 Iniciando Escaneo de PELÍCULAS Manual...');
    try {
        // Escaneamos las peliculas usando el directorio configurado
        const moviePath = process.env.MEDIA_SCAN_DIRS || '/home/media/peliculas';
        console.log(`Buscando en directorio: ${moviePath}`);

        // scanDirectories(moviePath, seriesPath) -> pasamos undefined a seriesPath
        const files = await MediaScannerService.scanDirectories(moviePath, undefined);
        console.log(`[MediaScanner] Escaneo completo: ${files.length} archivos de películas encontrados.`);

        // Importar secuencialmente para no sobrecargar la API de TMDB (Evita Error 429 Too Many Requests)
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            if (!f.alreadyImported) {
                if (f.extension === 'VACÍA') {
                    console.log(`⚠️  Registrando carpeta vacía como Fallida: ${f.fileName} (Falta video)`);
                    await MediaScannerService.importFile(f.filePath, 'MOVIE', f.episode);
                } else {
                    console.log(`⏳ [${i + 1}/${files.length}] Encolando Película: ${f.fileName}...`);
                    await MediaScannerService.importFile(f.filePath, 'MOVIE', f.episode);
                    // Pausa de 200ms entre llamadas para no saturar a TMDB
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
        }

        console.log('✅ ¡Escaneo de Películas Finalizado!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error fatal en el escáner de películas:', err);
        process.exit(1);
    }
}

run();
