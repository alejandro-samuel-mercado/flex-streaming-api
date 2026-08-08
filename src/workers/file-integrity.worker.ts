import fs from 'fs';
import { prisma } from '../shared/config/prisma';
import { generateSignedUrl } from '../services/token.service';

export class FileIntegrityWorker {
    private static interval: NodeJS.Timeout | null = null;
    private static isRunning = false;

    public static start() {
        if (this.interval) return;
        
        console.log('🛡️ File Integrity Worker initialized (Runs every 6 hours)');
        
        // Ejecutar inmediatamente al inicio (con un pequeño delay para no bloquear el arranque)
        setTimeout(() => this.runCheck(), 10000);

        // Ejecutar cada 6 horas
        this.interval = setInterval(() => this.runCheck(), 6 * 60 * 60 * 1000);
    }

    public static stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    public static async runCheck() {
        if (this.isRunning) return;
        this.isRunning = true;

        console.log('🔍 [IntegrityCheck] Iniciando escaneo de integridad de archivos de video...');
        
        try {
            // Obtener todos los contenidos (Películas y Series)
            const contents = await prisma.content.findMany({
                where: { deletedAt: null },
                include: {
                    videoFiles: true, // Películas
                    seasons: {
                        include: {
                            episodes: {
                                include: { videoFiles: true }
                            }
                        }
                    } // Series
                }
            });

            let missingCount = 0;
            let healthyCount = 0;

            for (const content of contents) {
                let hasMissingFiles = false;

                if (content.type === 'MOVIE') {
                    // Para películas, revisamos si tiene videoFiles y si existen en disco
                    if (content.videoFiles.length > 0) {
                        for (const vf of content.videoFiles) {
                            const exists = await this.checkPhysicalExistence(vf);
                            if (!exists) {
                                hasMissingFiles = true;
                                break;
                            }
                        }
                    } else {
                        // Si no tiene videoFiles, técnicamente le faltan archivos
                        hasMissingFiles = true;
                    }
                } else if (content.type === 'SERIES' || content.type === 'ANIME' || content.type === 'NOVELA') {
                    // Para series, revisamos episodios
                    for (const season of content.seasons) {
                        for (const episode of season.episodes) {
                            if (episode.videoFiles.length > 0) {
                                for (const vf of episode.videoFiles) {
                                    const exists = await this.checkPhysicalExistence(vf);
                                    if (!exists) {
                                        hasMissingFiles = true;
                                        break;
                                    }
                                }
                            } else {
                                // Episodio sin video
                                hasMissingFiles = true;
                            }
                            if (hasMissingFiles) break;
                        }
                        if (hasMissingFiles) break;
                    }
                }

                // Actualizar solo si cambió el estado
                if ((content as any).hasMissingFiles !== hasMissingFiles) {
                    await prisma.content.update({
                        where: { id: content.id },
                        data: { hasMissingFiles } as any
                    });
                }

                if (hasMissingFiles) {
                    missingCount++;
                } else {
                    healthyCount++;
                }
            }

            console.log(`✅ [IntegrityCheck] Finalizado. Sanos: ${healthyCount} | Fallados: ${missingCount}`);
        } catch (err: any) {
            console.error('❌ [IntegrityCheck] Error durante el chequeo:', err.message);
        } finally {
            this.isRunning = false;
        }
    }

    private static async checkPhysicalExistence(vf: any): Promise<boolean> {
        // Ignorar tipos que no son archivos locales (por ejemplo enlaces externos de YouTube, directos, etc)
        if (vf.type === 'URL' || vf.type === 'EXTERNAL' || vf.type === 'EMBED') return true;

        // Si está COMPLETED, el hlsPath (o el masterPlaylist si no hay hlsPath) debe existir
        if (vf.status === 'COMPLETED' || vf.status === 'READY') {
            // 1. Chequeo local rápido (por si está en un disco de red compartido montado localmente)
            if (vf.hlsPath && fs.existsSync(vf.hlsPath)) return true;
            if (vf.originalPath && fs.existsSync(vf.originalPath)) return true;

            // 2. Chequeo remoto vía HTTP (Porque los workers tienen sus propios discos)
            let baseUrl = '';
            if (vf.sourceNode === 'MOVIES') {
                baseUrl = 'https://peliculas-streamflex.unixxtech.online';
            } else if (vf.sourceNode === 'SERIES') {
                baseUrl = 'https://series-streamflex.unixxtech.online';
            } else {
                baseUrl = 'https://api-streamflex.unixxtech.online';
            }
            
            let filename = 'master.m3u8';
            if (vf.masterPlaylist) {
                filename = vf.masterPlaylist.split('/').pop() || 'master.m3u8';
            }

            // Generamos un token válido para acceder al endpoint (como hace el reproductor)
            const token = generateSignedUrl(vf.id, '127.0.0.1', 60);
            const url = `${baseUrl}/api/stream/hls/${vf.id}/${filename}?token=${token}`;
            
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                const res = await fetch(url, { method: 'HEAD', signal: controller.signal as any });
                clearTimeout(timeout);
                // Si el worker responde 200 (OK) o 206 (Partial Content), el archivo existe y es accesible
                if (res.ok || res.status === 206) return true;
                
                // Si responde explícitamente 404, entonces sí falta el archivo.
                if (res.status === 404) return false;

                // Si responde otro error (ej. 502 Bad Gateway), asumimos true para no borrarlo por accidente
                return true;
            } catch (e) {
                // Si hay error de red (worker caído, timeout), asumimos true para no generar falsos positivos.
                return true;
            }
        }
        
        // Si está en QUEUED o PROCESSING, el originalPath debe existir para poder procesarse
        if (vf.status === 'QUEUED' || vf.status === 'PROCESSING') {
            // Asumimos que está sano porque está procesándose en un worker remoto
            // y no podemos verificar el archivo original de forma remota tan fácil.
            return true;
        }

        // Si está FAILED, le falta el archivo exitoso
        return false;
    }
}
