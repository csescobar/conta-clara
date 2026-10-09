import type { AuthUser } from './types.js';

declare global {
  namespace Express {
    interface Request {
      /** Preenchido por `requireAuth`. */
      auth: AuthUser;
    }
  }
}

export {};
