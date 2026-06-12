export declare class CategoriesService {
    static getAllContentTypes(): Promise<("SERIES" | "MOVIE" | "ANIME" | "ANIMATION" | "DOCUMENTARY" | "BIOGRAPHY" | "REALITY_SHOW" | "TALK_SHOW" | "VARIETY_SHOW" | "STAND_UP" | "SPECIAL" | "EDUCATIONAL" | "KIDS" | "FAMILY" | "INTERACTIVE" | "EXPERIMENTAL" | "DOCUDRAMA" | "NOVELA" | "SHORT")[]>;
    static getAllGenres(): Promise<{
        id: string;
        name: string;
        slug: string;
        icon: string | null;
    }[]>;
    static createGenre(data: {
        name: string;
        slug: string;
    }): Promise<{
        id: string;
        name: string;
        slug: string;
        icon: string | null;
    }>;
    static updateGenre(id: string, data: {
        name?: string;
        slug?: string;
    }): Promise<{
        id: string;
        name: string;
        slug: string;
        icon: string | null;
    }>;
    static deleteGenre(id: string): Promise<{
        id: string;
        name: string;
        slug: string;
        icon: string | null;
    }>;
    static getAllAgeRatings(): Promise<{
        code: string;
        id: string;
        label: string;
    }[]>;
    static createAgeRating(data: {
        code: string;
        label: string;
    }): Promise<{
        code: string;
        id: string;
        label: string;
    }>;
    static updateAgeRating(id: string, data: {
        code?: string;
        label?: string;
    }): Promise<{
        code: string;
        id: string;
        label: string;
    }>;
    static deleteAgeRating(id: string): Promise<{
        code: string;
        id: string;
        label: string;
    }>;
    static getAllTags(): Promise<{
        id: string;
        name: string;
        slug: string;
    }[]>;
    static createTag(data: {
        name: string;
        slug: string;
    }): Promise<{
        id: string;
        name: string;
        slug: string;
    }>;
    static updateTag(id: string, data: {
        name?: string;
        slug?: string;
    }): Promise<{
        id: string;
        name: string;
        slug: string;
    }>;
    static deleteTag(id: string): Promise<{
        id: string;
        name: string;
        slug: string;
    }>;
}
//# sourceMappingURL=categories.service.d.ts.map