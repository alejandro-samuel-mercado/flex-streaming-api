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
//# sourceMappingURL=queue.service.d.ts.map