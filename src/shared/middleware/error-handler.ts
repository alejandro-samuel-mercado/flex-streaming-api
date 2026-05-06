import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  console.error('Unhandled error:', err);

  // Mask technical errors (Prisma, etc.) for the client
  let clientMessage = 'Internal server error';
  
  if (env.NODE_ENV !== 'production') {
    clientMessage = err.message;
  }

  // Specifically mask Prisma errors or internal invocation errors to protect technical details
  if (err.message.includes('Prisma') || err.message.includes('invocation') || err.message.includes('fkey')) {
    clientMessage = 'Error de base de datos. Por favor, contacte al soporte técnico.';
  }

  res.status(500).json({
    success: false,
    error: clientMessage,
  });
}
