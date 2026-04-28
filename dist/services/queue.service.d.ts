import { Queue, QueueEvents } from 'bullmq';
export declare const videoQueue: Queue<any, any, string, any, any, string>;
export declare const videoQueueEvents: QueueEvents;
export declare function addVideoJob(jobData: {
    contentId: string;
    seasonId?: string;
    episodeId?: string;
    videoPath: string;
}): Promise<import("bullmq").Job<any, any, string>>;
//# sourceMappingURL=queue.service.d.ts.map