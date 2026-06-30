import { MediaScannerService } from './src/modules/media-scanner/media-scanner.service';
import { env } from './src/shared/config/env';

async function run() {
  console.log('🔍 Iniciando Escaneo de SERIES Manual...');
  try {
    // Escaneamos las series usando el directorio configurado en MEDIA_SCAN_DIRS o la ruta estática
    const seriesPath = process.env.MEDIA_SCAN_DIRS || '/home/media/series';
    console.log(`Buscando en directorio: ${seriesPath}`);
    
    // scanDirectories(moviePath, seriesPath) -> pasamos undefined a moviePath
    const files = await MediaScannerService.scanDirectories(undefined, seriesPath);
    console.log(`[MediaScanner] Escaneo completo: ${files.length} archivos/carpetas de series encontrados.`);
    
    // Importar en lotes para no sobrecargar
    const BATCH_SIZE = 50;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async f => {
        if (!f.alreadyImported && f.extension !== 'VACÍA') {
          console.log(`⏳ Encolando Serie/Episodio: ${f.fileName}...`);
          await MediaScannerService.importFile(f.filePath, 'SERIES', f.episode);
        }
      }));
    }
    
    console.log('✅ ¡Escaneo de Series Finalizado!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error fatal en el escáner de series:', err);
    process.exit(1);
  }
}

run();
