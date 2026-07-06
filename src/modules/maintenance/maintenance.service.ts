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
            this.cleanGhostSeries();
            this.intervalId = setInterval(() => this.cleanGhostSeries(), this.CLEANUP_INTERVAL);
        }, this.INITIAL_DELAY);
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

                // If a series is older than 24h and only has 1 or 0 episodes, it's considered an orphaned ghost series.
                if (totalEpisodes <= 1 || (isGarbageTitle && totalEpisodes === 0)) {
                    console.log(`[Maintenance] 🗑️ Deleting ghost/minimal series: "${title}" (ID: ${s.id}, Episodes: ${totalEpisodes})`);
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
