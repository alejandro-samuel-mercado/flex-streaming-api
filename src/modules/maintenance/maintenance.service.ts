import { prisma } from '../../shared/config/prisma';

export class MaintenanceService {
    private static intervalId: NodeJS.Timeout | null = null;
    private static readonly CLEANUP_INTERVAL = 1000 * 60 * 60 * 2; // 2 hours
    // Run first cleanup 5 minutes after boot to avoid high load at startup
    private static readonly INITIAL_DELAY = 1000 * 60 * 5;

    static start() {
        if (this.intervalId) return;

        console.log('[Maintenance] Scheduled automated ghost series cleanup');
        setTimeout(() => {
            this.runAllCleanupTasks();
            this.intervalId = setInterval(() => this.runAllCleanupTasks(), this.CLEANUP_INTERVAL);
        }, this.INITIAL_DELAY);
    }

    private static async runAllCleanupTasks() {
        await this.cleanGhostSeries();
        await this.cleanStuckJobs();
    }

    static async cleanStuckJobs() {
        try {
            console.log('[Maintenance] Running scheduled stuck transcode jobs cleanup...');
            const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

            // Mark video files stuck in PROCESSING/QUEUED for more than 6h as FAILED
            const stuck = await prisma.videoFile.updateMany({
                where: {
                    status: { in: ['PROCESSING', 'QUEUED'] },
                    updatedAt: { lt: sixHoursAgo }
                },
                data: {
                    status: 'FAILED',
                    errorMessage: 'Cancelado automáticamente: El proceso superó las 6 horas de inactividad.'
                }
            });

            if (stuck.count > 0) {
                console.log(`[Maintenance] 🔓 Auto-recovered ${stuck.count} stuck transcode jobs (marked as FAILED for re-scanning).`);
            } else {
                console.log('[Maintenance] No stuck transcode jobs found.');
            }
        } catch (error) {
            console.error('[Maintenance] Error during stuck jobs cleanup:', error);
        }
    }

    static async cleanGhostSeries() {
        try {
            console.log('[Maintenance] Running scheduled ghost series cleanup...');
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

            // Find series created more than 2 hours ago
            const series = await prisma.content.findMany({
                where: {
                    type: 'SERIES',
                    createdAt: { lt: twoHoursAgo }
                },
                include: {
                    seasons: {
                        include: { episodes: true }
                    },
                    translations: true
                }
            });

            let deletedCount = 0;
            for (const s of series) {
                // Calculate total episodes
                let totalEpisodes = 0;
                for (const season of s.seasons) {
                    totalEpisodes += season.episodes.length;
                }

                // Also detect garbage titles
                const title = s.translations[0]?.title || '';
                const isGarbageTitle = /^\d+[\s_-]/.test(title) || /^\d+$/.test(title) || title.includes('Sin título');

                // Si la serie tiene más de 2 horas y tiene 1 o 0 episodios, se considera falsa/fantasma según tu regla.
                if (totalEpisodes <= 1 || (isGarbageTitle && totalEpisodes === 0)) {
                    console.log(`[Maintenance] 🗑️ Deleting ghost/minimal series: "${title}" (ID: ${s.id}, Episodes: ${totalEpisodes})`);
                    
                    // IMPORTANTE: Antes de borrar el Content, borramos sus VideoFiles para que no queden huérfanos
                    await prisma.videoFile.deleteMany({
                        where: {
                            OR: [
                                { contentId: s.id },
                                { episode: { season: { contentId: s.id } } }
                            ]
                        }
                    });
                    
                    await prisma.content.delete({ where: { id: s.id } });
                    deletedCount++;
                }
            }

            console.log(`[Maintenance] Cleanup finished. Deleted ${deletedCount} ghost series.`);
        } catch (error) {
            console.error('[Maintenance] Error during ghost series cleanup:', error);
        }
    }
}
