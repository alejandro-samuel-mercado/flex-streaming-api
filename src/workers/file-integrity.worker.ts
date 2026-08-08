import fs from 'fs';
import { prisma } from '../shared/config/prisma';

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
                            if (!this.checkPhysicalExistence(vf)) {
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
                                    if (!this.checkPhysicalExistence(vf)) {
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

    private static checkPhysicalExistence(vf: any): boolean {
        // Si está COMPLETED, el hlsPath (o el masterPlaylist si no hay hlsPath) debe existir
        if (vf.status === 'COMPLETED' || vf.status === 'READY') {
            if (vf.hlsPath && fs.existsSync(vf.hlsPath)) return true;
            if (vf.originalPath && fs.existsSync(vf.originalPath)) return true;
            return false;
        }
        
        // Si está en QUEUED o PROCESSING, el originalPath debe existir para poder procesarse
        if (vf.status === 'QUEUED' || vf.status === 'PROCESSING') {
            if (vf.originalPath && fs.existsSync(vf.originalPath)) return true;
            return false;
        }

        // Si está FAILED, le falta el archivo exitoso
        return false;
    }
}
