/**
 * Auth Service — PeliPlus
 *
 * Handles: user registration, login, JWT generation/rotation, refresh tokens stored in Redis,
 * Google OAuth, and password reset via email token.
 *
 * Dependencies: Prisma (users, refreshTokens), Redis (token storage), bcrypt, jsonwebtoken, nodemailer
 */
import type { RegisterInput, LoginInput } from './auth.schemas';
export declare function register(input: RegisterInput): Promise<{
    user: {
        id: string;
        name: string | null;
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
    };
    accessToken: string;
    refreshToken: string;
}>;
export declare function login(input: LoginInput): Promise<{
    user: {
        id: string;
        phone: string;
        name: string;
        role: "END_USER";
    };
    accessToken: string;
    refreshToken: string;
} | {
    user: {
        id: string;
        phone: string;
        username: string | null;
        name: string | null;
        role: import(".prisma/client").$Enums.UserRole;
    };
    accessToken: string;
    refreshToken: string;
}>;
export declare function refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
}>;
export declare function logout(refreshToken: string): Promise<void>;
export declare function forgotPassword(phone: string): Promise<void>;
export declare function resetPassword(token: string, newPassword: string): Promise<void>;
export declare function findOrCreateGoogleUser(googleProfile: {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string;
}): Promise<{
    user: {
        id: string;
        username: string | null;
        passwordHash: string | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        name: string | null;
        phone: string;
        googleId: string | null;
        appleId: string | null;
        role: import(".prisma/client").$Enums.UserRole;
        isActive: boolean;
        preferredLang: string | null;
        credits: number;
        parentId: string | null;
    };
    accessToken: string;
    refreshToken: string;
}>;
export declare function changePassword(userId: string, currentPasswordRaw: string, newPasswordRaw: string): Promise<void>;
//# sourceMappingURL=auth.service.d.ts.map