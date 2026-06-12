import { Queue, QueueEvents } from 'bullmq';
export declare const videoQueue: Queue<any, any, string, any, any, string>;
export declare const videoQueueEvents: QueueEvents;
export declare function addVideoJob(jobData: {
    videoFileId: string;
    contentId: string;
    type?: string;
    seasonId?: string;
    episodeId?: string;
    videoPath: string;
}): Promise<import("bullmq").Job<any, any, string>>;
export declare function removeVideoJob(jobId: string): Promise<boolean>;
export declare function getJobLogs(jobId: string): Promise<{
    logs: string[];
    count: number;
}>;
/**
 * Deterministic schedule logic:
 * - Always active between 3:00 AM and 6:59 AM (3 AM to 7 AM uninterrupted block).
 * - Otherwise, follows a 6-hour cycle: 2 hours active, 4 hours rest (anchored at 00:00).
 */
export declare function isProcessingAllowed(): boolean;
export declare function startQueueScheduler(): void;
//# sourceMappingURL=queue.service.d.ts.map