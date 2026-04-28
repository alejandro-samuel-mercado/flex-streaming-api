export declare class ActorsService {
    static getAllActors(page?: number, limit?: number, search?: string): Promise<{
        data: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            photoUrl: string | null;
            birthDate: Date | null;
            nationality: string | null;
            biography: string | null;
            tmdbId: string | null;
        }[];
        total: number;
        page: number;
        limit: number;
    }>;
    static getActorById(id: string): Promise<({
        contents: ({
            content: {
                type: import(".prisma/client").$Enums.ContentType;
                id: string;
                slug: string;
                releaseYear: number | null;
            };
        } & {
            contentId: string;
            actorId: string;
            order: number;
            character: string | null;
        })[];
    } & {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        photoUrl: string | null;
        birthDate: Date | null;
        nationality: string | null;
        biography: string | null;
        tmdbId: string | null;
    }) | null>;
    static createActor(data: any): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        photoUrl: string | null;
        birthDate: Date | null;
        nationality: string | null;
        biography: string | null;
        tmdbId: string | null;
    }>;
    static updateActor(id: string, data: any): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        photoUrl: string | null;
        birthDate: Date | null;
        nationality: string | null;
        biography: string | null;
        tmdbId: string | null;
    }>;
    static deleteActor(id: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        photoUrl: string | null;
        birthDate: Date | null;
        nationality: string | null;
        biography: string | null;
        tmdbId: string | null;
    }>;
    static getAllDirectors(page?: number, limit?: number, search?: string): Promise<{
        data: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            photoUrl: string | null;
            birthDate: Date | null;
            nationality: string | null;
            biography: string | null;
            tmdbId: string | null;
        }[];
        total: number;
        page: number;
        limit: number;
    }>;
    static getDirectorById(id: string): Promise<({
        contents: ({
            content: {
                type: import(".prisma/client").$Enums.ContentType;
                id: string;
                slug: string;
                releaseYear: number | null;
            };
        } & {
            contentId: string;
            directorId: string;
        })[];
    } & {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        photoUrl: string | null;
        birthDate: Date | null;
        nationality: string | null;
        biography: string | null;
        tmdbId: string | null;
    }) | null>;
    static createDirector(data: any): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        photoUrl: string | null;
        birthDate: Date | null;
        nationality: string | null;
        biography: string | null;
        tmdbId: string | null;
    }>;
    static updateDirector(id: string, data: any): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        photoUrl: string | null;
        birthDate: Date | null;
        nationality: string | null;
        biography: string | null;
        tmdbId: string | null;
    }>;
    static deleteDirector(id: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        photoUrl: string | null;
        birthDate: Date | null;
        nationality: string | null;
        biography: string | null;
        tmdbId: string | null;
    }>;
}
//# sourceMappingURL=actors.service.d.ts.map