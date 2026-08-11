import 'dotenv/config';
import { MediaScannerService } from './src/modules/media-scanner/media-scanner.service';

async function test() {
    const filePath = '/home/peliplus_gran_disco/videos_subidos/Operacion_Sombra_Nueva.mkv';
    console.log("Probando importFile para:", filePath);
    const result = await MediaScannerService.importFile(filePath, 'MOVIE');
    console.log("Resultado:", result);
}
test().catch(console.error).finally(() => process.exit(0));
