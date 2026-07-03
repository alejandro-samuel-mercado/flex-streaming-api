import { MediaScannerService } from './src/modules/media-scanner/media-scanner.service';

async function run() {
    console.log('🔍 Iniciando Escaneo de PELÍCULAS Manual...');
    try {
        // Escaneamos las peliculas usando el directorio configurado
        const moviePath = process.env.MEDIA_SCAN_DIRS || '/home/media/movies';
        console.log(`Buscando en directorio: ${moviePath}`);

        // scanDirectories(moviePath, seriesPath) -> pasamos undefined a seriesPath
        const files = await MediaScannerService.scanDirectories(moviePath, undefined);
        console.log(`[MediaScanner] Escaneo completo: ${files.length} archivos de películas encontrados.`);

        // Importar en lotes para no sobrecargar
        const BATCH_SIZE = 50;
        for (let i = 0; i < files.length; i += BATCH_SIZE) {
            const batch = files.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async f => {
                if (!f.alreadyImported) {
                    if (f.extension === 'VACÍA') {
                        console.log(`⚠️  Registrando carpeta vacía como Fallida: ${f.fileName} (Falta video)`);
                        await MediaScannerService.importFile(f.filePath, 'MOVIE');
                    } else {
                        console.log(`⏳ Encolando Película: ${f.fileName}...`);
                        await MediaScannerService.importFile(f.filePath, 'MOVIE');
                    }
                }
            }));
        }

        console.log('✅ ¡Escaneo de Películas Finalizado!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error fatal en el escáner de películas:', err);
        process.exit(1);
    }
}

run();
