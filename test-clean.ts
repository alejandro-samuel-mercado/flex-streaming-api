import 'dotenv/config';
import { MediaScannerService } from './src/modules/media-scanner/media-scanner.service';
console.log("TEST:", MediaScannerService.cleanFileName("152511_las_inclemencias_del_amor"));
console.log("TEST SPACE:", MediaScannerService.cleanFileName("152511 las inclemencias del amor"));
