import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(8),
  password: z.string().min(8).max(72),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
  deviceType: z.enum(['TV', 'MOBILE', 'WEB']).optional(),
});

export const forgotPasswordSchema = z.object({
  phone: z.string().min(8),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(72),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
