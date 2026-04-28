import { Content } from '@prisma/client';
export declare class RecommendationService {
    getRecommendationsForProfile(profileId: string): Promise<Content[]>;
    incrementViewCount(contentId: string): Promise<void>;
}
export declare const recommendationService: RecommendationService;
//# sourceMappingURL=recommendation.service.d.ts.map